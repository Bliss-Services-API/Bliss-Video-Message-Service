'use strict';

/**
 * 
 * Route for Handling all of the Bliss Video Requesting and Responding Operations
 * 
 * @param {AWS-SDK Object} DynamoDBClient AWS SDK Object, containing the DynamoDB CLient Object
 * @param {AWS-SDK Object} S3Client AWS SDK Object, containing the S3 CLient Object
 * @param {AWS-SDK Object} SNSClient AWS SDK Object, containing the SNS CLient Object
 * 
 */
module.exports = (DynamoDBClient, S3Client, SNSClient) => {
    
    //Importing Modules
    const fs = require('fs');
    const express = require('express');
    const router = express.Router();
    const multer = require('multer');
    const controllers = require('../controller');
    const chalk = require('../chalk.console');

    //Initializing Variables
    const blissResponseMultipart = multer({dest: 'tmp/response'});
    const blissRequestMultipart = multer({dest: 'tmp/request'});
    const Controller = controllers(DynamoDBClient, S3Client, SNSClient);

    const responseBlissController = Controller.responseBlissController;
    const requestBlissController = Controller.requestBlissController;


    /**
     * 
     * POST Bliss Video and Send it to the Requesting Client
     * 
     */
    router.post('/response', 
        blissResponseMultipart.single('bliss_response_video'),
        async (req, res) => {
            try {
                const blissRequestId = req.body.bliss_request_id;
                const clientId = req.body.client_id;
                const celebName = req.body.celeb_name;

                if(clientId === null || clientId === undefined)
                    throw new Error('bliss_requester is undefined');

                if(celebName === null || celebName === undefined)
                    throw new Error('bliss_responder is undefined');

                if(req.file === null || req.file === undefined) 
                    throw new Error('bliss_video is undefined');

                const blissVideoStream = fs.createReadStream(req.file.path);
                const blissMIMEType = req.file.mimetype;
                
                const { blissResponseId, expireTime } = responseBlissController.getBlissResponseIdandExpireTime();
                const { blissRequestDate, blissRequestTime } = responseBlissController.getRequestDateandTime(blissRequestId);

                await responseBlissController.uploadBlissResponseVideo(blissResponseId, blissVideoStream, blissMIMEType);
                await responseBlissController.transmuxBlissResponseVideo(blissResponseId, blissVideoStream, blissMIMEType);
                await responseBlissController.uploadBlissResponseData(blissResponseId, blissRequestId, clientId, celebName, expireTime);
                await responseBlissController.sendBlissResponseNotification(blissResponseId, clientId, celebName, blissRequestDate, blissRequestTime);

                res.send({
                    MESSAGE: 'DONE',
                    RESPONSE: 'Bliss Sent!',
                    CODE: 'BLISS_SENT'
                });
            }
            catch(err) {
                res.send({
                    ERR: err.message,
                    RESPONSE: 'Bliss Response Failed!',
                    CODE: 'BLISS_RESPONSE_FAILED',
                })
            }
        }
    );

    /**
     * 
     * GET Response Video, submitted by Celebs (Responders) to the Clients (Requesters)
     * 
     */
    router.get('/response/video/downloadurl', async (req, res) => {
        try {
            const blissResponseId = req.body.bliss_response_id;

            if(blissResponseId === null || blissResponseId === undefined)
                throw new Error('bliss_response_id param is not defined');

            const videoExists = await responseBlissController.checkResponseVideoExists(blissResponseId);
            if(videoExists) {
                
                const url = responseBlissController.getBlissResponseDownloadURL(blissRequestId);

                res.send({
                    MESSAGE: 'DONE',
                    RESPONSE: 'Bliss Response Video Download SignedURL Fetched!',
                    CODE: 'BLISS_RES_VIDEO_URL_FETCHED',
                    URL: url.signedUrl,
                    EXPIRETIME: url.expireTime
                });
            }
            else {
                throw new Error(`Response Doesn't Exists! VideoId: ${blissResponseId}`);
            }
        }
        catch(err) {
            console.error(chalk.error(`ERR: ${err.message}`));

            res.send({
                ERR: err.message,
                RESPONSE: 'Bliss Response Video Download SignedURL Fetch Failed!',
                CODE: 'BLISS_RES_VIDEO_URL_FETCH_FAILED',
            })
        };
    });

    /**
     * 
     * POST Bliss Request by Submitting A Client (Requester) Form
     * 
     */
    router.post('/request/data', async (req, res) => {
        try {
            const clientId = req.body.clien_id;
            const celebName = req.body.celeb_name;
            const blissRequestData = req.body.bliss_request_data;
            const clientName = req.body.client_name;

            if(clientId === null || clientId === undefined)
                throw new Error('bliss_requester is undefined');

            if(celebName === null || celebName === undefined)
                throw new Error('bliss_responder is undefined');

            if(blissRequestData === null || blissRequestData === undefined)
                throw new Error('bliss_request_data is undefined');

            const { blissRequestId, expireTime } = requestBlissController.getBlissRequestIdandExpireTime();

            await requestBlissController.uploadBlissRequestData(blissRequestId, clientId, celebName, blissRequestData, expireTime);
            await requestBlissController.sendBlissRequestNotification(blissRequestId, clientId, celebName);

            res.send({
                MESSAGE: 'DONE',
                RESPONSE: 'Bliss Sent!',
                CODE: 'BLISS_SENT',
                BLISS_ID: blissId
            });
        }
        catch(err) {
            console.error(chalk.error(`ERR: ${err.message}`));

            res.send({
                ERR: err.message,
                RESPONSE: 'Bliss Upload Failed!',
                CODE: 'BLISS_UPLOAD_FAILED'
            })
        };
    });

    /**
     * 
     * POST Bliss Request by Submitting A Client (Requester) Video
     * 
     */
    router.post('/request/video', 
        blissRequestMultipart.single('bliss-request-video'),
        async (req, res) => {
            try {
                const clientId = req.body.bliss_requester;
                const celebName = req.body.bliss_responder;

                if(clientId === null || clientId === undefined)
                    throw new Error('bliss_requester is undefined');

                if(celebName === null || celebName === undefined)
                    throw new Error('bliss_responder is undefined');

                if(req.file === null || req.file === undefined) 
                    throw new Error('bliss_video is undefined');

                const blissRequestVideoStream = fs.createReadStream(req.file.path);
                const blissRequestMIMEType = req.file.mimetype;
                
                const { blissRequestId, expireTime } = requestBlissController.getBlissRequestIdandExpireTime();

                await requestBlissController.uploadBlissRequestVideo(blissRequestId, blissRequestVideoStream, blissRequestMIMEType);
                await requestBlissController.uploadBlissRequestData(blissRequestId, clientId, celebName, expireTime);
                await requestBlissController.sendBlissRequestNotification(blissRequestId, clientId, celebName);
 
                res.send({
                    MESSAGE: 'DONE',
                    RESPONSE: 'Bliss Sent!',
                    CODE: 'BLISS_SENT',
                    BLISS_ID: blissId
                });
            }
            catch(err) {
                console.error(chalk.error(`ERR: ${err.message}`));

                res.send({
                    ERR: err.message,
                    RESPONSE: 'Bliss Upload Failed!',
                    CODE: 'BLISS_UPLOAD_FAILED'
                })
            };
        }
    );

    /**
     * 
     * GET Url for Downloading Client's Requested Video for a Bliss from a Celeb (Responder)
     * 
     */
    router.get('/request/video/downloadurl', async (req, res) => {
        try {
            const blissRequestId = req.body.bliss_request_id;

            if(blissRequestId === null || blissRequestId === undefined)
                throw new Error('bliss_request_id param is not defined');

            const videoExists = await requestBlissController.checkRequestVideoExists(blissRequestId);
            if(videoExists) {
                const url = requestBlissController.getBlissRequestVideoDownloadURL(blissRequestId);

                res.send({
                    MESSAGE: 'DONE',
                    RESPONSE: 'Bliss Video Download SignedURL Fetched!',
                    CODE: 'BLISS_REQ_VIDEO_URL_FETCHED',
                    URL: url.signedUrl,
                    EXPIRETIME: url.expireTime
                });
            }
            else {
                throw new Error(`Video Doesn't Exist! VideoId: ${blissRequestId}`);
            }
        }
        catch(err) {
            console.error(chalk.error(`ERR: ${err.message}`));

            res.send({
                ERR: err.message,
                RESPONSE: 'Bliss Video Download SignedURL Fetch Failed',
                CODE: 'BLISS_REQ_VIDEO_URL_FETCH_FAILED',
            })
        };
    });

    /**
     * 
     * GET Url for Downloading Client's Request Data for a Bliss from a Celeb (Responder)
     * 
     */
    router.get('/request/data/download', async (req, res) => {
        try {
            const blissRequestId = req.body.bliss_request_id;

            if(blissRequestId === null || blissRequestId === undefined)
                throw new Error('bliss_request_id param is not defined');

            const data = await requestBlissController.getBlissRequestData(blissRequestId);

            res.send({
                MESSAGE: 'DONE',
                RESPONSE: 'Bliss Request Data Fetched!',
                CODE: 'BLISS_REQ_DATA_FETCHED',
                DATA: data
            });
        }
        catch(err) {
            console.error(chalk.error(`ERR: ${err.message}`));

            res.send({
                ERR: err.message,
                RESPONSE: 'Bliss Video Download SignedURL Fetch Failed',
                CODE: 'BLISS_REQ_DATA_FETCHED_FAILED',
            })
        };
    });

    router.get('/request/cancel', async (req, res) => {
        try {
            const blissRequestId = req.body.bliss_request_id;

            if(blissRequestId === null || blissRequestId === undefined)
                throw new Error('bliss_request_id param is not defined');

            await requestBlissController.cancelBlissRequest(blissRequestId);

            res.send({
                MESSAGE: 'DONE',
                RESPONSE: 'Bliss Request Deleted!',
                CODE: 'BLISS_REQ_DELETED'
            });
        }
        catch(err) {
            console.error(chalk.error(`ERR: ${err.message}`));

            res.send({
                ERR: err.message,
                RESPONSE: 'Bliss Request Delete Failed!',
                CODE: 'BLISS_REQ_DELETE_FAILED'
            })
        };
    })

    return router;
}