#!/usr/bin/env python
# -*- coding: utf-8 -*-

# Useful documentation:
#   https://adamj.eu/tech/2019/04/22/testing-boto3-with-pytest-fixtures/
#   https://botocore.amazonaws.com/v1/documentation/api/latest/reference/stubber.html


from string import Template

import boto3
import pytest
import pytest_mock

import cdk_packages.assets.lambda_functions.secret_rotation_cognito.secret_rotation_cognito as secret_rotation_cognito
import tests.sample_returns_secretsmanager as returns_secretsmanager
from tests.sample_event_createSecret import event as event_create_secret
from tests.sample_event_finishSecret import event as event_finish_secret
from tests.sample_event_setSecret import event as event_set_secret
from tests.sample_event_testSecret import event as event_test_secret

# get region from boto3
session = boto3.session.Session()
region_name = session.region_name
account_id = session.client('sts').get_caller_identity().get('Account')

client_secretsmanager = boto3.client('secretsmanager')

SECRET_NAME = 'WickrIO-Cognito-User-Password'


class MockSecret:

    def __init__(self):
        # construct mock object to represent secret
        self.secret_value = returns_secretsmanager.describe_secret
        self.secret_value['mock_data'] = {}
        for key in self.secret_value['VersionIdsToStages']:
            if 'AWSPENDING' not in returns_secretsmanager.describe_secret['VersionIdsToStages'][key]:
                self.secret_value['mock_data'][key] = returns_secretsmanager.get_secret_value.copy()
                self.secret_value['mock_data'][key]['VersionId'] = key
                self.secret_value['mock_data'][key]['VersionStages'] = \
                    returns_secretsmanager.describe_secret['VersionIdsToStages'][key]

    def describe_secret_fn(self, SecretId=None):
        return self.secret_value

    def get_secret_value(self, SecretId=None, VersionId=None, VersionStage='AWSCURRENT'):
        if not VersionId:
            for key in self.secret_value['mock_data']:
                if VersionStage in self.secret_value['mock_data'][key]['VersionStages']:
                    VersionId = key
                    break
        if VersionId not in self.secret_value['mock_data'].keys():
            raise Exception()
        if VersionStage in self.secret_value['mock_data'][VersionId]['VersionStages']:
            return self.secret_value['mock_data'][VersionId]


mock_secret = MockSecret()


def replace_identifiers(original):
    replacement = original
    token, name_postfix = get_secret_attr(SECRET_NAME)
    replacement['SecretId'] = Template(replacement['SecretId']).substitute(
        region_name=region_name,
        account_id=account_id,
        name_postfix=name_postfix,
    )
    replacement['ClientRequestToken'] = Template(replacement['ClientRequestToken']).substitute(
        token=token,
    )
    return replacement


def get_secret_attr(secret_name):
    response = client_secretsmanager.list_secrets(
        Filters=[
            {
                'Key': 'name',
                'Values': [secret_name]
            },
        ],
    )
    arn = response['SecretList'][0]['ARN']
    name_postfix = arn[-6:]
    metadata = client_secretsmanager.describe_secret(SecretId=arn)
    for entry in metadata['VersionIdsToStages']:
        if 'AWSCURRENT' in metadata['VersionIdsToStages'][entry]:
            token = entry
            break
    return token, name_postfix


TEST_SEQUENCE = {
    'createSecret': {'event': replace_identifiers(event_create_secret)},
    'setSecret': {'event': replace_identifiers(event_set_secret)},
    'testSecret': {'event': replace_identifiers(event_test_secret)},
    'finishSecret': {'event': replace_identifiers(event_finish_secret)},
}


# @pytest.mark.parametrize('test_case', TEST_CASES)
def test_cognito_secret_rotation(mock_secret_rotation_cognito):
    event = TEST_SEQUENCE['createSecret']['event']
    resp = secret_rotation_cognito.lambda_handler(event)
    assert resp is True
    event = TEST_SEQUENCE['setSecret']['event']
    resp = secret_rotation_cognito.lambda_handler(event)
    assert resp is True
    event = TEST_SEQUENCE['testSecret']['event']
    resp = secret_rotation_cognito.lambda_handler(event)
    assert resp is True
    event = TEST_SEQUENCE['finishSecret']['event']
    resp = secret_rotation_cognito.lambda_handler(event)
    assert resp is True


@pytest.fixture
def mock_secret_rotation_cognito(mocker):
    mocker.patch.object(
        secret_rotation_cognito.client_secretsmanager,
        'describe_secret',
        mock_secret.describe_secret_fn,
    )
    mocker.patch.object(
        secret_rotation_cognito.client_secretsmanager,
        'get_secret_value',
        mock_secret.get_secret_value,
    )
    yield
