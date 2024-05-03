#!/usr/bin/env python
# -*- coding: utf-8 -*-

# Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

# source: https://github.com/aws-samples/aws-secrets-manager-rotation-lambdas/blob/master/SecretsManagerRotationTemplate/lambda_function.py

import json
import logging
import sys
import traceback

import boto3

LOGGER = logging.getLogger()
LOGGER.setLevel(logging.INFO)

# set up boto3 clients and resources
client_secretsmanager = boto3.client('secretsmanager')
client_cognito = boto3.client('cognito-idp')
client_ssm = boto3.client('ssm')
client_iam = boto3.client('iam')


def lambda_handler(event=None, context=None):
    """
    Function is triggered by secret rotation event.
    """
    resp = None
    try:
        resp = secret_rotation(event, context)
    except Exception:
        # log any exception, required for troubleshooting
        exception_type, exception_value, exception_traceback = sys.exc_info()
        traceback_string = traceback.format_exception(
            exception_type, exception_value, exception_traceback)
        err_msg = json.dumps({
            "errorType": exception_type.__name__,
            "errorMessage": str(exception_value),
            "stackTrace": traceback_string
        })
        LOGGER.error(err_msg)

    return resp


def secret_rotation(event, context):
    """Secrets Manager Rotation Template

    This is a template for creating an AWS Secrets Manager rotation lambda

    Args:
        event (dict): Lambda dictionary of event parameters. These keys must include the following:
            - SecretId: The secret ARN or identifier
            - ClientRequestToken: The ClientRequestToken of the secret version
            - Step: The rotation step (one of createSecret, setSecret, testSecret, or finishSecret)

        context (LambdaContext): The Lambda runtime information

    Raises:
        ResourceNotFoundException: If the secret with the specified arn and stage does not exist

        ValueError: If the secret is not properly configured for rotation

        KeyError: If the event parameters do not contain the expected keys

    """

    arn = event['SecretId']
    token = event['ClientRequestToken']
    step = event['Step']

    # Make sure the version is staged correctly
    metadata = client_secretsmanager.describe_secret(SecretId=arn)
    if not metadata['RotationEnabled']:
        raise ValueError(f'Secret {arn} is not enabled for rotation')
    versions = metadata['VersionIdsToStages']
    if token not in versions:
        raise ValueError(f'Secret version {token} has no stage for rotation of secret {arn}.')
    if 'AWSCURRENT' in versions[token]:
        LOGGER.info(f'Secret version {token} already set as AWSCURRENT for secret {arn}.')
        return True
    elif 'AWSPENDING' not in versions[token]:
        raise ValueError(f'Secret version {token} not set as AWSPENDING for rotation of secret {arn}.')

    if step == 'createSecret':
        create_secret(arn, token)
    elif step == 'setSecret':
        set_secret(arn, token)
    elif step == 'testSecret':
        test_secret(arn, token)
    elif step == 'finishSecret':
        finish_secret(arn, token)

    else:
        raise ValueError('Invalid step parameter')


def create_secret(arn, token):
    """Create the secret

    This method first checks for the existence of a secret for the passed in token. If one does not exist, it will generate a
    new secret and put it with the passed in token.

    Args:
        arn (string): The secret ARN or other identifier
        token (string): The ClientRequestToken associated with the secret version

    Raises:
        ResourceNotFoundException: If the secret with the specified arn and stage does not exist

    """
    curr_secret = json.loads(
        client_secretsmanager.get_secret_value(
            SecretId=arn,
            VersionStage='AWSCURRENT')['SecretString']
    )

    # Now try to get the secret version, if that fails, put a new secret
    # Make sure the current secret exists
    try:
        client_secretsmanager.get_secret_value(SecretId=arn, VersionId=token, VersionStage='AWSPENDING')
        LOGGER.info(f'createSecret: Successfully retrieved secret for {arn}.')
    except client_secretsmanager.exceptions.ResourceNotFoundException:
        # Create new access key for IAM user
        response = client_iam.create_access_key(
            UserName=curr_secret['iam_user_name']
        )
        # Put the secret
        client_secretsmanager.put_secret_value(
            SecretId=arn,
            ClientRequestToken=token,
            VersionStages=['AWSPENDING'],
            SecretString=json.dumps(
                {
                    'iam_user_name': curr_secret['iam_user_name'],
                    'aws_access_key_id': response['AccessKey']['AccessKeyId'],
                    'aws_secret_access_key': response['AccessKey']['SecretAccessKey'],
                },
            ),
        )
        # delete old access key
        if 'aws_access_key_id' in curr_secret.keys():
            client_iam.delete_access_key(
                UserName=curr_secret['iam_user_name'],
                AccessKeyId=curr_secret['aws_access_key_id']
            )
        LOGGER.info(f'createSecret: Successfully put secret for ARN {arn} and version {token}.')


def set_secret(arn, token):
    """Set the secret

    This method should set the AWSPENDING secret in the service that the secret belongs to. For example, if the secret is a database
    credential, this method should take the value of the AWSPENDING secret and set the user's password to this value in the database.

    Args:
        arn (string): The secret ARN or other identifier
        token (string): The ClientRequestToken associated with the secret version

    """

    LOGGER.info('set_secret: Nothing to do here. IAM access key already created and secret '
                'already set as part of create_secret().')


def test_secret(arn, token):
    """Test the secret

    This method should validate that the AWSPENDING secret works in the service that the secret belongs to. For example, if the secret
    is a database credential, this method should validate that the user can login with the password in AWSPENDING and that the user has
    all of the expected permissions against the database.

    If the test fails, this function should raise an exception. (Any exception.)
    If no exception is raised, the test is considered to have passed. (The return value is ignored.)

    Args:
        arn (string): The secret ARN or other identifier
        token (string): The ClientRequestToken associated with the secret version

    """

    LOGGER.info('test_secret: Nothing to do here. Can not test access key within lambda function.')


def finish_secret(arn, token):
    """Finish the secret

    This method finalizes the rotation process by marking the secret version passed in as the AWSCURRENT secret.

    Args:
        arn (string): The secret ARN or other identifier
        token (string): The ClientRequestToken associated with the secret version

    Raises:
        ResourceNotFoundException: If the secret with the specified arn does not exist

    """
    # First describe the secret to get the current version
    metadata = client_secretsmanager.describe_secret(SecretId=arn)
    current_version = None
    for version in metadata['VersionIdsToStages']:
        if 'AWSCURRENT' in metadata['VersionIdsToStages'][version]:
            if version == token:
                # The correct version is already marked as current, return
                LOGGER.info(f'finishSecret: Version {version} already marked as AWSCURRENT for {arn}')
                return
            current_version = version
            break

    # Finalize by staging the secret version current
    client_secretsmanager.update_secret_version_stage(
        SecretId=arn,
        VersionStage='AWSCURRENT',
        MoveToVersionId=token,
        RemoveFromVersionId=current_version
    )
    client_secretsmanager.update_secret_version_stage(
        SecretId=arn,
        VersionStage='AWSPENDING',
        RemoveFromVersionId=token
    )
    LOGGER.info(f'finishSecret: Successfully set AWSCURRENT stage to version {token} for secret {arn}.')
