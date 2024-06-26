#!/usr/bin/env python3

import aws_cdk as cdk
from constructs import Construct

from cdk_packages.ec2_instance import EC2Instance
from cdk_packages.network import Network
from cdk_packages.wickrio_code import WickrIOCode
from cdk_packages.wickrio_config import WickrIOConfig
from cdk_packages.iam_user import IamUser
from cdk_packages.iam_user_rotation import IamUserRotation
from cdk_packages.cognito_user import CognitoUser
from cdk_packages.cognito_user_rotation import CognitoUserRotation
from cdk_packages.appsync_cfg import AppSyncCfg
from cdk_packages.ec2_instance_connect_endpoint import EC2InstanceConnectEndpoint
from cdk_packages.ssh_enablement import SSHEnablement


class Params:
    """
    A class to hold all parameters exchanged across CDK constructs in one place.
    """


class WickrGenaiChatbotStack(cdk.Stack):

    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        params = Params()

        params.network = Network(self, 'Network', params)
        params.wickrio_instance = EC2Instance(self, 'EC2 instance', params)
        params.wickrio_code = WickrIOCode(self, 'Wickr IO code', params)
        params.wickrio_config = WickrIOConfig(self, 'Wickr IO config', params)
        params.iam_user = IamUser(self, 'Wickr IO IAM user', params)
        params.iam_user_rotation = IamUserRotation(self, 'Wickr IO IAM user rotation', params)
        params.cognito_user = CognitoUser(self, 'Wickr IO Cognito user', params)
        params.cognito_user_rotation = CognitoUserRotation(self, 'Wickr IO Cognito user rotation', params)
        params.appsync_cfg = AppSyncCfg(self, 'AppSync Configuration', params)

        # Enable SSH access to EC2 instance for troubleshooting
        params.ec2_instance_connection_endpoint = EC2InstanceConnectEndpoint(
            self, 'EC2 Instance Connection Endpoint', params)
        SSHEnablement(self, 'SSH Enablement', params)
