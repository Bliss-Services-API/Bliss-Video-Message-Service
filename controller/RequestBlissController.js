'use strict';

/**
 * 
 * Controllers for Handling Bliss Requesting Operations for Requesters (Clients)
 * 
 * @param {AWS-SDK Object} DynamoDBClient AWS SDK Object, containing the DynamoDB CLient Object
 * @param {AWS-SDK Object} S3Client AWS SDK Object, containing the S3 CLient Object
 * @param {AWS-SDK Object} SNSClient AWS SDK Object, containing the SNS CLient Object
 * 
 */
module.exports = (DynamoDBClient, S3Client, SNSClient) => {
    
    //Initializing Variables
    const blissRequestSNS = process.env.BLISS_REQUEST_SNS_ARN;
    const blissRequestDBTableName = process.env.BLISS_REQUEST_DB_TABLE_NAME;
    const blissRequestBucket = process.env.BLISS_REQUEST_BUCKET;
    
    /**
     * 
     * Get The Current Time, derive the Bliss Request Id and Expire Time from it. Currently,
     * expire time is 1 hour. In production env, it must be 7 days
     * 
     */
    const getBlissRequestIdandExpireTime = () => {
        const currTime = Date.now() / 1000;
        const normalizingTime = 880831800;
        const expireTime = currTime + (60 * 60);
        const blissRequestId = currTime - normalizingTime;

        return {
            blissRequestId,
            expireTime
        };
    };

    /**
     * 
     * Upload Bliss Video as Request for a Bliss from the Client, in the S3 Bucket
     * 
     * @param {number} blissResponseId Bliss Response Id
     * @param {object} blissStream Read Stream of the Videos for Responding to the bliss requests
     * @param {string} blissMIMEType MIME type of the bliss response video
     * 
     */
    const uploadBlissVideoRequest = async (blissRequestId, blissRequestStream, blissRequestMIMEType) => {
        const blissParam = { 
            Bucket: blissRequestBucket,
            Key: blissRequestId,
            Body: blissRequestStream,
            ContentType: blissRequestMIMEType
        };

        const s3UploadPromise = S3Client.upload(blissParam).promise();
        return s3UploadPromise.then(() => { return true });
    };

    /**
     * 
     * Upload Bliss Request Data in the DynamoDB
     * 
     * @param {number} blissResponseId Bliss Response Id
     * @param {string} clientId client_id, representing the client requesting for a bliss
     * @param {string} celebName celeb_name, representing the celeb responding to a bliss request
     * @param {json} blissRequestData JSON of Data to upload in the database as the Bliss Request
     * @param {int} expireTime TTL for the data stored in the Database
     * 
     */
    const uploadBlissRequestData = async (blissRequestId, clientId, celebName, blissVideoUploaded = false, blissRequestData = 'NA', expireTime) => {
        return new Promise((resolve, reject) => {
            try {
                const blissRequestPayload = {
                    TableName: blissRequestDBTableName,
                    Item: {
                        BLISS_REQUEST_ID: { N: blissRequestId },
                        CLIENT_ID: { S: clientId },
                        CELEB_NAME: { S: celebName },
                        BLISS_REQUEST_DATA: {S : JSON.stringify(blissRequestData)},
                        VIDEO_EXISTS: { BOOL: blissVideoUploaded },                        
                        EXPIRE_TIME: { N: expireTime }
                    }
                };

                DynamoDBClient.putItem(blissRequestPayload, (err, data) => {
                    if(err) 
                        return reject(err);
                    else
                        return resolve(blissRequestId);
                })
            }
            catch(err) {
                return reject(err);
            }
        })
    }

   /**
     * 
     * Send Notification to the SNS about the Request being uploaded, which will further
     * invoke function in the Notification Service to send the Notification to the Celeb
     * App using Firebase Cloud Messaging.
     * 
     * @param {number} blissResponseId Bliss Response Id
     * @param {string} clientId client_id, representing the client requesting for a bliss
     * @param {string} celebName celeb_name, representing the celeb responding to a bliss request
     * 
     */
    const sendBlissRequestNotification = (blissRequestId, celebName) => {
        const snsMessage = {
            BLISS_REQUEST_ID: blissRequestId,
            CELEB_NAME: celebName,
            CLIENT_NAME: clientName
        };

        const notification = {
            Message: JSON.stringify(snsMessage),
            TopicArn: blissRequestSNS
        };

        const snsClientPromise = SNSClient.publish(notification).promise();
        
        return snsClientPromise
            .then((data) => {
                console.log(chalk.success(`Bliss Request Sent. Message ID: ${data.MessageId}`));
                return [null, true];
            })
            .catch((err) => {
                console.error(chalk.error(`ERR: ${err.message}`));
                return [err, false];
            })
    };

    /**
     * 
     * Get Bliss Request Video URL for the Celeb (Responder)
     * 
     * @param {number} blissResponseId Bliss Response Id
     * 
     */
    const getBlissRequestVideoDownloadURL = (blissRequestId) => {
        const expireTime = 60 * 5;
        const videoParam = {
            Bucket: blissRequestBucket,
            Key: blissRequestId,
            Expires: expireTime
        };

        const signedUrl = S3Client.getSignedUrl('getObject', videoParam);
        return {signedUrl, expireTime};
    };

    /**
     * 
     * Get Bliss Request Data for the Celeb (Responder)
     * 
     * @param {number} blissResponseId Bliss Response Id
     * 
     */
    const getBlissRequestData = async (blissRequestId) => {
        return new Promise((resolve, reject) => {
            try {
                const dataParam = {
                    TableName: 'TABLE',
                    Key: {
                        'BLISS_ID': { N: blissRequestId }
                    },
                    ProjectionExpression: 'CLIENT_ID'
                };

                DynamoDBClient.getItem(dataParam, function(err, data) {
                    if (err)
                        return reject(err);
                    else {
                        return resolve(data);
                    }
                });
            }
            catch(err) {
                return reject(err);
            }
        });
    };

    /**
     * 
     * Check if the Bliss Request Video is Uploaded.
     * 
     * @param {number} blissResponseId Bliss Response Id
     * 
     */
    const checkRequestVideoExists = async (blissRequestId) => {
        return new Promise((resolve, reject) => {
            try {
                const videoParam = {
                    Bucket: blissRequestBucket,
                    Key: blissRequestId
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

    const cancelBlissRequest = async (blissRequestId) => {
        return new Promise((resolve, reject) => {
            try {
                const dataParam = {
                    TableName: blissRequestDBTableName,
                    Key:{
                        'BLISS_REQUEST_ID': blissRequestId
                    }
                };

                DynamoDBClient.delete(dataParam, function(err, data) {
                    if (err) {
                        return reject(err);
                    } else {
                        return resolve(data);
                    }
                });
            }
            catch(err) {
                return reject(err);
            }
        });
    }

    return {
        getBlissRequestIdandExpireTime,
        sendBlissRequestNotification,
        uploadBlissVideoRequest,
        getBlissRequestVideoDownloadURL,
        getBlissRequestData,
        uploadBlissRequestData,
        checkRequestVideoExists,
        cancelBlissRequest
    };
}