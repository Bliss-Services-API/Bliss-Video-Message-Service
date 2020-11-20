'use strict';

/**
 * 
 * Controllers for Handling Bliss Responding Operations for Responders (Celebs)
 * 
 * @param {AWS-SDK Object} DynamoDBClient AWS SDK Object, containing the DynamoDB CLient Object
 * @param {AWS-SDK Object} S3Client AWS SDK Object, containing the S3 CLient Object
 * @param {AWS-SDK Object} SNSClient AWS SDK Object, containing the SNS CLient Object
 * 
 */
module.exports = (DynamoDBClient, S3Client, SNSClient) => {
    
    //Importing Modules
    const fs = require('fs');
    const path = require('path');

    const privateKeyPath = path.join(__dirname, "../private/cloudfront_private.pem")
    const cloudFrontPrivate = fs.readFileSync(privateKeyPath);
    const cloudFrontAccessID = require('../private/cloudfront.accessid.json').ACCESSID;

    //Initializing Variables
    const blissResponseBucket = process.env.BLISS_RESPONSE_BUCKET;
    const blissResponseOutputBucket = process.env.BLISS_RESPONSE_OUTPUT_BUCKET;
    const blissResponseSNS = process.env.BLISS_RESPONSE_SNS_ARN;
    const blissRequestCancelSNS = process.env.BLISS_REQUEST_CANCEL_SNS_ARN;
    const blissResponseCDNUrl = process.env.BLISS_RESPONSE_CDN_URL;
    

    /**
     * 
     * Get The Current Time, derive the Bliss Request Id and Expire Time from it. Currently,
     * expire time is 1 hour. In production env, it must be 7 days
     * 
     */
    const getBlissResponseIdandExpireTime = () => {
        const currTime = Date.now() / 1000;
        const normalizingTime = 880831800;
        const expireTime = currTime + (60 * 60);
        const blissResponseId = currTime - normalizingTime;

        return {
            blissResponseId,
            expireTime
        };
    };

    const getRequestDateandTime = (blissRequestId) => {
        const normalizingTime = 880831800;

        const blissRequestTimestamp = (blissRequestId + normalizingTime) * 1000;
        const date = new Date(blissRequestTimestamp);

        const blissRequestDate = date.getDate();
        const blissRequestTime = date.getTime();

        return {
            blissRequestDate,
            blissRequestTime
        }
    }

    /**
     * 
     * Upload Bliss Video as Response to the Bliss request, in the S3 Bucket
     * 
     * @param {number} blissResponseId Bliss Response Id
     * @param {object} blissStream Read Stream of the Videos for Responding to the bliss requests
     * @param {string} blissMIMEType MIME type of the bliss response video
     * 
     */
    const uploadBlissResponseVideo = async (blissResponseId, blissStream, blissMIMEType) => {
        const blissParam = { 
            Bucket: blissResponseBucket,
            Key: blissResponseId,
            Body: blissStream,
            ContentType: blissMIMEType
        };

        const s3UploadPromise = S3Client.upload(blissParam).promise();

        return s3UploadPromise.then(() => { return true });
    };

    /**
     * 
     * Get Bliss Response from the Celeb (Responder) with the blissResponseId Attribute
     * 
     * @param {number} blissResponseId Bliss Response Id
     * 
     */
    const getBlissResponseDownloadURL = (blissResponseId) => {
        const cloudfrontAccessKeyId = cloudFrontAccessID;
        const cloudFrontPrivateKey = cloudFrontPrivate;

        const signer = new AWS.CloudFront.Signer(cloudfrontAccessKeyId, cloudFrontPrivateKey)

        const expire = 60 * 60 * 1000;

        const signedUrl = signer.getSignedUrl({
        url: `${blissResponseCDNUrl}/${blissResponseId}`,
            expires: Math.floor((Date.now() + expire)/1000), // Unix UTC timestamp for next one hour
        });

        return {signedUrl, expireTime};
    };

    /**
     * 
     * Send Notification to the SNS about the Response being uploaded, which will further
     * invoke function in the Notification Service to send the Notification to the Client
     * App using Firebase Cloud Messaging.
     * 
     * @param {number} blissResponseId Bliss Response Id
     * @param {string} clientId client_id, representing the client requesting for a bliss
     * @param {string} celebName celeb_name, representing the celeb responding to a bliss request
     * 
     */
    const sendBlissResponseNotification = async (blissResponseId, clientId, celebName, blissRequestDate, blissRequestTime) => {
        const snsMessage = {
            BLISS_RESPONSE_ID: blissResponseId,
            CLIENT_ID: clientId,
            CELEB_NAME: celebName,
            BLISS_REQUEST_DATE: blissRequestDate,
            BLISS_REQUEST_TIME: blissRequestTime,
        };

        const notification = {
            Message: JSON.stringify(snsMessage),
            TopicArn: blissResponseSNS
        };

        const snsClientPromise = SNSClient.publish(notification).promise();
        
        return snsClientPromise
            .then((data) => {
                console.log(chalk.success(`Bliss Uploaded Successfully. Message ID: ${data.MessageId}`));
                return [null, true];
            })
            .catch((err) => {
                console.error(chalk.error(`ERR: ${err.message}`));
                return [err, false];
            })
    };

    const sendBlissCancelNotification =  async (blissResponseId, clientId, celebName, blissRequestDate, blissRequestTime) => {
        const snsMessage = {
            BLISS_RESPONSE_ID: blissResponseId,
            CLIENT_ID: clientId,
            CELEB_NAME: celebName,
            BLISS_REQUEST_DATE: blissRequestDate,
            BLISS_REQUEST_TIME: blissRequestTime
        };

        const notification = {
            Message: JSON.stringify(snsMessage),
            TopicArn: blissRequestCancelSNS
        };

        const snsClientPromise = SNSClient.publish(notification).promise();
        
        return snsClientPromise
            .then((data) => {
                console.log(chalk.success(`Bliss Request Canceled Successfully. Message ID: ${data.MessageId}`));
                return [null, true];
            })
            .catch((err) => {
                console.error(chalk.error(`ERR: ${err.message}`));
                return [err, false];
            })
    };

    /**
     * 
     * Transmux/Transcode the Bliss Response Video using MediaConverter and then push the Video
     * Channels in the S3Output Bucket, which will further send the video to the CDN.
     * 
     * @param {number} blissResponseId Bliss Response Id
     * @param {object} blissStream Read Stream of the Videos for Responding to the bliss requests
     * @param {string} blissMIMEType MIME type of the bliss response video
     * 
     */
    const transmuxBlissResponseVideo = async (blissResponseId, blissStream, blissMIMEType) => {
        const blissParam = { 
            Bucket: blissResponseOutputBucket,
            Key: blissResponseId,
            Body: blissStream,
            ContentType: blissMIMEType
        };

        const s3UploadPromise = S3Client.upload(blissParam).promise();

        return s3UploadPromise.then(() => { return true });
    };

    /**
     * 
     * Check if the Bliss Response Video has been Uploaded yet.
     * 
     * @param {number} blissResponseId Bliss Response Id
     * 
     */
    const checkResponseVideoExists = async (blissResponseId) => {
        return new Promise((resolve, reject) => {
            try {
                const videoParam = {
                    Bucket: blissResponseOutputBucket,
                    Key: blissResponseId
                };
                
                S3Client.headObject(videoParam, (err, metadate) => {
                    if(err && err.statusCode === 404) {
                        return resolve(false);
                    } else if(err) {
                        return reject(err);
                    }else {
                        return resolve(true);
                    }
                });
            } catch(err) {
                return reject(err);
            };
        })
    };

    return {
        getBlissResponseIdandExpireTime,
        sendBlissResponseNotification,
        transmuxBlissResponseVideo,
        uploadBlissResponseVideo,
        checkResponseVideoExists,
        getBlissResponseDownloadURL,
        getRequestDateandTime,
        sendBlissCancelNotification
    };
}