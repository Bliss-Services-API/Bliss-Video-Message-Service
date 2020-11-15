const { DynamoDB } = require('aws-sdk');

'use strict';


/**
 * 
 * Index of All Controllers used in the Bliss Video Messaging Service
 * 
 * @param {AWS-SDK Object} DynamoDBClient AWS SDK Object, containing the DynamoDB CLient Object
 * @param {AWS-SDK Object} S3Client AWS SDK Object, containing the S3 CLient Object
 * @param {AWS-SDK Object} SNSClient AWS SDK Object, containing the SNS CLient Object
 * 
 */
module.exports = (DynamoDBClient, S3Client, SNSClient) => {
    const responseBlissController = require('./ResponseBlissController')(DynamoDBClient, S3Client, SNSClient);
    const requestBlissController = require('./RequestBlissController')(DynamoDBClient, S3Client, SNSClient);

    return {
        requestBlissController,
        responseBlissController
    }
}