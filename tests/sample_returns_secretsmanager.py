describe_secret = {
    "ARN": "arn:aws:secretsmanager:eu-west-1:123456789012:secret:WickrIO-Cognito-User-Password-VBBXcM",
    "Name": "WickrIO-Cognito-User-Password",
    "RotationEnabled": True,
    "RotationLambdaARN": "arn:aws:lambda:eu-west-1:123456789012:function:WickrGenaiChatbot-WickrIOCognitouserrotationSecret-lflHn4A6V6oX",
    "RotationRules": {"AutomaticallyAfterDays": 30},
    "LastRotatedDate": "2024-02-22 11:16:15.807000+04:00",
    "LastChangedDate": "2024-02-22 11:33:32.874000+04:00",
    "LastAccessedDate": "2024-02-22 04:00:00+04:00",
    "NextRotationDate": "2024-03-24 03:59:59+04:00",
    "Tags": [
        {
            "Key": "aws:cloudformation:stack-name",
            "Value": "WickrGenaiChatbot"},
        {
            "Key": "aws:cloudformation:logical-id",
            "Value": "WickrIOCognitouserSecretCognitouserpassword810012D8"
        },
        {
            "Key": "aws:cloudformation:stack-id",
            "Value": "arn:aws:cloudformation:eu-west-1:123456789012:stack/WickrGenaiChatbot/25f47370-d145-11ee-8f76-0e57504cb259"
        }
    ],
    "VersionIdsToStages": {
        "46851283-e0b7-464f-9b27-5bb430ff18f0": ["AWSPREVIOUS"],
        "70f6ed2e-842d-4fc8-8864-184f883e9f34": ["AWSCURRENT"],
        "a2bfc2d9-9ce7-41c3-b548-e2bcb63a9f89": ["AWSPENDING"],
    },
    "CreatedDate": "2024-02-22 09:42:40.760000+04:00",
    "ResponseMetadata": {
        "RequestId": "82d3244b-d967-4325-86f2-fddc638cd53f", "HTTPStatusCode": 200,
        "HTTPHeaders": {
            "x-amzn-requestid": "82d3244b-d967-4325-86f2-fddc638cd53f",
            "content-type": "application/x-amz-json-1.1", "content-length": "968",
            "date": "Thu, 22 Feb 2024 07:45:18 GMT"
        },
        "RetryAttempts": 0}
}

get_secret_value = {
    "ARN": "arn:aws:secretsmanager:eu-west-1:123456789012:secret:WickrIO-Cognito-User-Password-VBBXcM",
    "Name": "WickrIO-Cognito-User-Password",
    "VersionId": "a2bfc2d9-9ce7-41c3-b548-e2bcb63a9f89",
    "SecretString": "abcdefghijklmno123456789&%$",
    "VersionStages": ["AWSPENDING"],
    "CreatedDate": "2024-02-22 11:16:14.206000+04:00",
    "ResponseMetadata": {
        "RequestId": "5e6e5e94-78bf-4ed8-9434-68a1ec64e17b",
        "HTTPStatusCode": 200,
        "HTTPHeaders": {
            "x-amzn-requestid": "5e6e5e94-78bf-4ed8-9434-68a1ec64e17b",
            "content-type": "application/x-amz-json-1.1", "content-length": "301",
            "date": "Thu, 22 Feb 2024 09:31:52 GMT"
        },
        "RetryAttempts": 0}
}
