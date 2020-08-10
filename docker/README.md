# Deploy to AWS
Once making a change to this repository, there are two steps involved in deploying those changes to production. First, the updated image must be appropriately tagged and pushed to Docker Hub. Then, the AWS docker-compose configuration files must be updated to reference this newly tagged and pushed image.
## Build & Push to Docker Hub
TODO: Consolidate into a robust `sh` script.
From the same directory as this document, run the following commands:
```
cd docker
# Make sure the local docker deamon is running
docker build \
    -t watutor/openvidu-call-react:<TAG> \
    . && \
# Make sure 'watutor' is the active Docker Hub account
docker push watutor/openvidu-call-react:<TAG>
```
## Restart OpenVidu server in AWS
1. You will need to SSH into the running AWS instance, requiring the proper `.pem` file.
```
# NOTE The url of the instance will need to be updated if the current stack is deleted and replaced.
ssh \
    -i path/to/test-openvidu.pem \
    ubuntu@ec2-34-215-106-69.us-west-2.compute.amazonaws.com
```
2. Once connected to the AWS instance via SHH, navegate to the OpenVidu management folder
```
cd /opt/openvidu
```
3. Modify ```docker-compose.override.yml``` to pull the image with the desired TAG. `vim` will do for this:
```
image: watutor/openvidu-call-react:<TAG>
```
4. From the command prompt, run the following command. Any changes pushed to the master branch of this repository should be reflected in the deployed version.
```
sudo ./openvidu restart
```