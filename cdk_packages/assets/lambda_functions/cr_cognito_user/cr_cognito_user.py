#!/usr/bin/env python
# -*- coding: utf-8 -*-

import json
import logging
import sys
import traceback
import uuid

import boto3

LOGGER = logging.getLogger()
LOGGER.setLevel(logging.INFO)

client_cognito_idp = boto3.client('cognito-idp')
client_ssm = boto3.client('ssm')
client_secretsmanager = boto3.client('secretsmanager')


def on_event(event=None, context=None):
    """
    AWS CDK custom resource handler

    Rotate Cognito user password used by the Wickr IO integration code

    """
    resp = None
    try:
        resp = process_event(event, context)
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


def process_event(event, context):
    LOGGER.info(f'event = {json.dumps(event)}')
    request_type = event['RequestType']
    if request_type == 'Create':
        return on_create(event)
    if request_type == 'Update':
        return on_update(event)
    if request_type == 'Delete':
        return on_delete(event)
    raise Exception(f'Invalid request type: {request_type}')


def on_create(event):
    LOGGER.info(f'on_create event for resource: {event["LogicalResourceId"]}')
    props = event['ResourceProperties']

    user_id = create_user_id(props)
    update_parameter_store(user_id)
    rotate_secret()


def on_update(event):
    logical_resource_id = event['LogicalResourceId']
    physical_resource_id = event['PhysicalResourceId']
    LOGGER.info(f'on_update event for resource: {logical_resource_id}')
    props = event['ResourceProperties']
    old_props = event['OldResourceProperties']

    if props != old_props:
        new_user_id = create_user_id(props)
        user = get_user()
        delete_user_id(user)
        update_parameter_store(new_user_id)
        rotate_secret()

    return {'PhysicalResourceId': physical_resource_id}


def on_delete(event):
    logical_resource_id = event["LogicalResourceId"]
    physical_resource_id = event['PhysicalResourceId']
    LOGGER.info(f'on_delete event for resource: {logical_resource_id}')

    user = get_user()
    delete_user_id(user)

    return {'PhysicalResourceId': physical_resource_id}


def create_user_id(props):
    user_id = f'{props["WickrUserName"]}-{uuid.uuid4().hex[:8]}@{props["EmailDomain"]}'
    LOGGER.info(f'Creating Cognito user ID: {user_id}')
    client_cognito_idp.admin_create_user(
        UserPoolId=props['AuthenticationUserPoolId'],
        Username=user_id,
        MessageAction='SUPPRESS',
    )
    return user_id


def get_user():
    response = client_ssm.get_parameter(Name='/Wickr-GenAI-Chatbot/wickr-io-cognito-config')
    user = json.loads(response['Parameter']['Value'])
    return user


def update_parameter_store(user_id):
    response = client_ssm.get_parameter(Name='/Wickr-GenAI-Chatbot/wickr-io-cognito-config')
    user = json.loads(response['Parameter']['Value'])
    user['user_id'] = user_id
    client_ssm.put_parameter(
        Name='/Wickr-GenAI-Chatbot/wickr-io-cognito-config',
        Value=json.dumps(user),
        Overwrite=True,
    )


def delete_user_id(user):
    response = client_cognito_idp.list_users(
        UserPoolId=user['user_pool_id'],
        AttributesToGet=[
            'email',
        ],
        Filter=f'email="{user["user_id"]}"',
    )
    for cognito_user in response['Users']:
        LOGGER.info(f'Deleting Cognito user ID: {cognito_user["Username"]}, user email: {user["user_id"]}')
        client_cognito_idp.admin_delete_user(
            UserPoolId=user['user_pool_id'],
            Username=cognito_user['Username'],
        )


def rotate_secret():
    client_secretsmanager.rotate_secret(
        SecretId='WickrIO-Cognito-User-Password',
    )
