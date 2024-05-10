#!/usr/bin/env python3

import os.path

import aws_cdk as cdk
from aws_cdk import (
    aws_ec2 as ec2,
)
from constructs import Construct

dirname = os.path.dirname(__file__)


class EC2InstanceConnectEndpoint(Construct):

    def __init__(self, scope: Construct, construct_id: str, params=None):
        super().__init__(scope, construct_id)

        self.ec2ice_sg = ec2.SecurityGroup(
            self, "EC2 ICE security group",
            vpc=params.network.vpc,
            description="EC2 ICE security group",
        )

        ec2.CfnInstanceConnectEndpoint(
            self, 'EC2 Instance Connect Endpoint',
            subnet_id=params.network.vpc.select_subnets(subnet_group_name='Private').subnet_ids[0],
            security_group_ids=[self.ec2ice_sg.security_group_id],
            tags=[cdk.CfnTag(
                key='Name',
                value=f'{cdk.Stack.of(self).stack_name}/EC2 Instance Connect Endpoint',
            )]
        )
