#!/bin/bash

cd ../docker && \
docker build -t watutor/openvidu-call-react:$1 --no-cache . && \
docker push watutor/openvidu-call-react:$1 && \
cd ../openvidu-call-react && \
ssh -i ssh-openvidu-pro.pem ubuntu@ec2-44-236-41-220.us-west-2.compute.amazonaws.com