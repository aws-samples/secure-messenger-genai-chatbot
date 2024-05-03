#!/usr/bin/env python3

from aws_cdk import (
    aws_ec2 as ec2,
)
from constructs import Construct


class Network(Construct):

    def __init__(self, scope: Construct, construct_id: str, params=None):
        super().__init__(scope, construct_id)

        self.vpc = ec2.Vpc(
            self, 'VPC',
            max_azs=1,
            nat_gateways=1,
            subnet_configuration=[
                ec2.SubnetConfiguration(
                    name='Public-NAT', subnet_type=ec2.SubnetType.PUBLIC,
                ),
                ec2.SubnetConfiguration(
                    name='Private', subnet_type=ec2.SubnetType.PRIVATE_WITH_EGRESS,
                ),
            ],
            restrict_default_security_group=True,
        )
        self.subnets = self.vpc.select_subnets()

        self.vpc.add_flow_log(
            'FlowLogCloudWatch',
            traffic_type=ec2.FlowLogTrafficType.ALL,
            max_aggregation_interval=ec2.FlowLogMaxAggregationInterval.TEN_MINUTES
        )
