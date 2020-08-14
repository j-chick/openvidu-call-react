import React, { Component } from 'react';
import axios from 'axios';
import fetch from 'node-fetch';

import './VideoRoomComponent.css';
import { OpenVidu } from 'openvidu-browser';

import StreamComponent from './stream/StreamComponent';
import DialogExtensionComponent from './dialog-extension/DialogExtension';
import ChatComponent from './chat/ChatComponent';
import OpenViduLayout from '../layout/openvidu-layout';
import UserModel from '../models/user-model';
import ToolbarComponent from './toolbar/ToolbarComponent';

const localUser = new UserModel();

class VideoRoomComponent extends Component {
  constructor(props) {
    super(props);

    this.OPENVIDU_SERVER_URL = 'https://video.watutors.com';
    this.OPENVIDU_SERVER_SECRET = 'WATUTORS_SECRET';
    this.hasBeenUpdated = false;
    this.layout = new OpenViduLayout();

    const params = {};

    const parts = window.location.href.split('/')[3].split('?')[1].split('&');

    for (let i = 0; i < parts.length; i += 1) {
      const pair = parts[i].split('=');
      params[pair[0]] = decodeURIComponent(pair[1]);
    }

    const {
      sessionName, userName, isProvider, authToken,
    } = params;

    this.isProvider = isProvider;

    this.state = {
      mySessionId: sessionName,
      myUserName: userName,
      session: undefined,
      localUser: undefined,
      subscribers: [],
      chatDisplay: 'none',
      authToken,
    };

    this.joinSession = this.joinSession.bind(this);
    this.leaveSession = this.leaveSession.bind(this);
    this.onbeforeunload = this.onbeforeunload.bind(this);
    this.updateLayout = this.updateLayout.bind(this);
    this.camStatusChanged = this.camStatusChanged.bind(this);
    this.micStatusChanged = this.micStatusChanged.bind(this);
    this.nicknameChanged = this.nicknameChanged.bind(this);
    this.toggleFullscreen = this.toggleFullscreen.bind(this);
    this.screenShare = this.screenShare.bind(this);
    this.stopScreenShare = this.stopScreenShare.bind(this);
    this.closeDialogExtension = this.closeDialogExtension.bind(this);
    this.toggleChat = this.toggleChat.bind(this);
    this.checkNotification = this.checkNotification.bind(this);
    this.checkSize = this.checkSize.bind(this);
    this.toggleCamera = this.toggleCamera.bind(this);
  }

  componentDidMount() {
    const openViduLayoutOptions = {
      maxRatio: 3 / 2, // The narrowest ratio that will be used (default 2x3)
      minRatio: 9 / 16, // The widest ratio that will be used (default 16x9)
      fixedRatio: false, // If this is true then the aspect ratio of the video is maintained and minRatio and maxRatio are ignored (default false)
      bigClass: 'OV_big', // The class to add to elements that should be sized bigger
      bigPercentage: 0.8, // The maximum percentage of space the big ones should take up
      bigFixedRatio: false, // fixedRatio for the big ones
      bigMaxRatio: 3 / 2, // The narrowest ratio to use for the big elements (default 2x3)
      bigMinRatio: 9 / 16, // The widest ratio to use for the big elements (default 16x9)
      bigFirst: true, // Whether to place the big one in the top left (true) or bottom right
      animate: true, // Whether you want to animate the transitions
    };

    this.layout.initLayoutContainer(document.getElementById('layout'), openViduLayoutOptions);
    window.addEventListener('beforeunload', this.onbeforeunload);
    window.addEventListener('resize', this.updateLayout);
    window.addEventListener('resize', this.checkSize);
    this.joinSession();
  }

  componentWillUnmount() {
    window.removeEventListener('beforeunload', this.onbeforeunload);
    window.removeEventListener('resize', this.updateLayout);
    window.removeEventListener('resize', this.checkSize);
    this.leaveSession();
  }

  onbeforeunload() {
    this.leaveSession();
  }

  connect(token) {
    this.state.session
      .connect(
        token,
        { clientData: this.state.myUserName },
      )
      .then(() => {
        this.connectWebCam();
      })
      .catch((error) => {
        if (this.props.error) {
          this.props.error({
            error: error.error, messgae: error.message, code: error.code, status: error.status,
          });
        }
        alert('There was an error connecting to the session:', error.message);
        console.log('There was an error connecting to the session:', error.code, error.message);
      });
  }

  connectWebCam() {
    const publisher = this.OV.initPublisher(undefined, {
      audioSource: undefined,
      videoSource: undefined,
      publishAudio: localUser.isAudioActive(),
      publishVideo: localUser.isVideoActive(),
      resolution: '640x480',
      frameRate: 30,
      insertMode: 'APPEND',
    });

    if (this.state.session.capabilities.publish) {
      this.state.session.publish(publisher).then(() => {
        if (this.props.joinSession) {
          this.props.joinSession();
        }
      });
    }
    localUser.setNickname(this.state.myUserName);
    localUser.setConnectionId(this.state.session.connection.connectionId);
    localUser.setScreenShareActive(false);
    localUser.setStreamManager(publisher);
    this.subscribeToUserChanged();
    this.subscribeToStreamDestroyed();
    this.sendSignalUserChanged({ isScreenShareActive: localUser.isScreenShareActive() });

    this.setState({ localUser }, () => {
      this.state.localUser.getStreamManager().on('streamPlaying', (e) => {
        this.updateLayout();
        publisher.videos[0].video.parentElement.classList.remove('custom-class');
      });
    });
  }

  toggleCamera() {
    const isFrontCamera = localUser.isFrontCamera();
    const { session } = this.state;

    this.OV.getDevices()
      .then((devices) => {
        const videoDevices = devices.filter((device) => device.kind === 'videoinput');

        if (videoDevices && videoDevices.length > 1) {
          const newPublisher = this.OV.initPublisher(undefined, {
            videoSource: isFrontCamera ? videoDevices[1].deviceId : videoDevices[0].deviceId,
            publishAudio: localUser.isAudioActive(),
            publishVideo: localUser.isVideoActive(),
            mirror: isFrontCamera,
            resolution: '640x480',
            frameRate: 30,
            insertMode: 'APPEND',
          });

          session.unpublish(localUser.getStreamManager());

          localUser.setStreamManager(newPublisher);

          session.publish(newPublisher)
            .then(() => {
              localUser.setFrontCamera(!isFrontCamera);
              this.setState({ localUser }, () => {
                this.sendSignalUserChanged({ isFrontCamera: localUser.isFrontCamera() });
              });
            });

          this.state.localUser.getStreamManager().on('streamPlaying', () => {
            this.updateLayout();
            newPublisher.videos[0].video.parentElement.classList.remove('custom-class');
          });
        }
      });
  }

  leaveSession() {
    const { mySessionId, authToken } = this.state;

    const mySession = this.state.session;

    if (mySession) {
      fetch('https://20200810t211851-dot-watutors-1.uc.r.appspot.com/v2/session/paid/scheduled/call_event', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: {
          sid: mySessionId,
          newState: 'ended',
        },
      });

      mySession.disconnect();
    }

    // Empty all properties...
    this.OV = null;
    this.setState({
      session: undefined,
      subscribers: [],
      mySessionId: 'SessionA',
      myUserName: `OpenVidu_User${Math.floor(Math.random() * 100)}`,
      localUser: undefined,
      authToken: '',
    });
  }

  camStatusChanged() {
    localUser.setVideoActive(!localUser.isVideoActive());
    localUser.getStreamManager().publishVideo(localUser.isVideoActive());
    this.sendSignalUserChanged({ isVideoActive: localUser.isVideoActive() });
    this.setState({ localUser });
  }

  micStatusChanged() {
    localUser.setAudioActive(!localUser.isAudioActive());
    localUser.getStreamManager().publishAudio(localUser.isAudioActive());
    this.sendSignalUserChanged({ isAudioActive: localUser.isAudioActive() });
    this.setState({ localUser });
  }

  nicknameChanged(nickname) {
    const { localUser } = this.state;
    localUser.setNickname(nickname);
    this.setState({ localUser });
    this.sendSignalUserChanged({ nickname: this.state.localUser.getNickname() });
  }

  deleteSubscriber(stream) {
    const remoteUsers = this.state.subscribers;
    const userStream = remoteUsers.filter((user) => user.getStreamManager().stream === stream)[0];
    const index = remoteUsers.indexOf(userStream, 0);
    if (index > -1) {
      remoteUsers.splice(index, 1);
      this.setState({
        subscribers: remoteUsers,
      });
    }
  }

  subscribeToStreamCreated() {
    this.state.session.on('streamCreated', (event) => {
      const subscriber = this.state.session.subscribe(event.stream, undefined);
      const { subscribers } = this.state;
      subscriber.on('streamPlaying', (e) => {
        this.checkSomeoneShareScreen();
        subscriber.videos[0].video.parentElement.classList.remove('custom-class');
      });
      const newUser = new UserModel();
      newUser.setStreamManager(subscriber);
      newUser.setConnectionId(event.stream.connection.connectionId);
      newUser.setType('remote');
      const nickname = event.stream.connection.data.split('%')[0];
      newUser.setNickname(JSON.parse(nickname).clientData);
      subscribers.push(newUser);
      this.setState(
        {
          subscribers,
        },
        () => {
          if (this.state.localUser) {
            this.sendSignalUserChanged({
              isAudioActive: this.state.localUser.isAudioActive(),
              isVideoActive: this.state.localUser.isVideoActive(),
              nickname: this.state.localUser.getNickname(),
              isScreenShareActive: this.state.localUser.isScreenShareActive(),
            });
          }
          this.updateLayout();
        },
      );
    });
  }

  subscribeToStreamDestroyed() {
    // On every Stream destroyed...
    this.state.session.on('streamDestroyed', (event) => {
      // Remove the stream from 'subscribers' array
      this.deleteSubscriber(event.stream);
      setTimeout(() => {
        this.checkSomeoneShareScreen();
      }, 20);
      event.preventDefault();
      this.updateLayout();
    });
  }

  subscribeToUserChanged() {
    this.state.session.on('signal:userChanged', (event) => {
      const remoteUsers = this.state.subscribers;
      remoteUsers.forEach((user) => {
        if (user.getConnectionId() === event.from.connectionId) {
          const data = JSON.parse(event.data);
          console.log('EVENTO REMOTE: ', event.data);
          if (data.isAudioActive !== undefined) {
            user.setAudioActive(data.isAudioActive);
          }
          if (data.isVideoActive !== undefined) {
            user.setVideoActive(data.isVideoActive);
          }
          if (data.nickname !== undefined) {
            user.setNickname(data.nickname);
          }
          if (data.isScreenShareActive !== undefined) {
            user.setScreenShareActive(data.isScreenShareActive);
          }
        }
      });
      this.setState(
        {
          subscribers: remoteUsers,
        },
        () => this.checkSomeoneShareScreen(),
      );
    });
  }

  updateLayout() {
    setTimeout(() => {
      this.layout.updateLayout();
    }, 20);
  }

  sendSignalUserChanged(data) {
    const signalOptions = {
      data: JSON.stringify(data),
      type: 'userChanged',
    };
    this.state.session.signal(signalOptions);
  }

  toggleFullscreen() {
    const { document } = window;
    const fs = document.getElementById('container');
    if (
      !document.fullscreenElement
      && !document.mozFullScreenElement
      && !document.webkitFullscreenElement
      && !document.msFullscreenElement
    ) {
      if (fs.requestFullscreen) {
        fs.requestFullscreen();
      } else if (fs.msRequestFullscreen) {
        fs.msRequestFullscreen();
      } else if (fs.mozRequestFullScreen) {
        fs.mozRequestFullScreen();
      } else if (fs.webkitRequestFullscreen) {
        fs.webkitRequestFullscreen();
      }
    } else if (document.exitFullscreen) {
      document.exitFullscreen();
    } else if (document.msExitFullscreen) {
      document.msExitFullscreen();
    } else if (document.mozCancelFullScreen) {
      document.mozCancelFullScreen();
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    }
  }

  screenShare() {
    const videoSource = navigator.userAgent.indexOf('Firefox') !== -1 ? 'window' : 'screen';
    const publisher = this.OV.initPublisher(
      undefined,
      {
        videoSource,
        publishAudio: localUser.isAudioActive(),
        publishVideo: localUser.isVideoActive(),
        mirror: false,
      },
      (error) => {
        if (error && error.name === 'SCREEN_EXTENSION_NOT_INSTALLED') {
          this.setState({ showExtensionDialog: true });
        } else if (error && error.name === 'SCREEN_SHARING_NOT_SUPPORTED') {
          alert('Your browser does not support screen sharing');
        } else if (error && error.name === 'SCREEN_EXTENSION_DISABLED') {
          alert('You need to enable screen sharing extension');
        } else if (error && error.name === 'SCREEN_CAPTURE_DENIED') {
          alert('You need to choose a window or application to share');
        }
      },
    );

    publisher.once('accessAllowed', () => {
      this.state.session.unpublish(localUser.getStreamManager());
      localUser.setStreamManager(publisher);
      this.state.session.publish(localUser.getStreamManager()).then(() => {
        localUser.setScreenShareActive(true);
        this.setState({ localUser }, () => {
          this.sendSignalUserChanged({ isScreenShareActive: localUser.isScreenShareActive() });
        });
      });
    });
    publisher.on('streamPlaying', () => {
      this.updateLayout();
      publisher.videos[0].video.parentElement.classList.remove('custom-class');
    });
  }

  closeDialogExtension() {
    this.setState({ showExtensionDialog: false });
  }

  stopScreenShare() {
    this.state.session.unpublish(localUser.getStreamManager());
    this.connectWebCam();
  }

  checkSomeoneShareScreen() {
    let isScreenShared;
    // return true if at least one passes the test
    isScreenShared = this.state.subscribers.some((user) => user.isScreenShareActive()) || localUser.isScreenShareActive();
    const openviduLayoutOptions = {
      maxRatio: 3 / 2,
      minRatio: 9 / 16,
      fixedRatio: isScreenShared,
      bigClass: 'OV_big',
      bigPercentage: 0.8,
      bigFixedRatio: false,
      bigMaxRatio: 3 / 2,
      bigMinRatio: 9 / 16,
      bigFirst: true,
      animate: true,
    };
    this.layout.setLayoutOptions(openviduLayoutOptions);
    this.updateLayout();
  }

  toggleChat(property) {
    let display = property;

    if (display === undefined) {
      display = this.state.chatDisplay === 'none' ? 'block' : 'none';
    }
    if (display === 'block') {
      this.setState({ chatDisplay: display, messageReceived: false });
    } else {
      console.log('chat', display);
      this.setState({ chatDisplay: display });
    }
    this.updateLayout();
  }

  checkNotification(event) {
    this.setState({
      messageReceived: this.state.chatDisplay === 'none',
    });
  }

  checkSize() {
    if (document.getElementById('layout').offsetWidth <= 700 && !this.hasBeenUpdated) {
      this.toggleChat('none');
      this.hasBeenUpdated = true;
    }
    if (document.getElementById('layout').offsetWidth > 700 && this.hasBeenUpdated) {
      this.hasBeenUpdated = false;
    }
  }

  render() {
    const { mySessionId } = this.state;
    const { localUser } = this.state;
    const chatDisplay = { display: this.state.chatDisplay };

    return (
      <div className="container" id="container">
        <ToolbarComponent
          sessionId={mySessionId}
          user={localUser}
          showNotification={this.state.messageReceived}
          toggleCamera={this.toggleCamera}
          camStatusChanged={this.camStatusChanged}
          micStatusChanged={this.micStatusChanged}
          screenShare={this.screenShare}
          stopScreenShare={this.stopScreenShare}
          toggleFullscreen={this.toggleFullscreen}
          leaveSession={this.leaveSession}
          toggleChat={this.toggleChat}
        />

        <DialogExtensionComponent showDialog={this.state.showExtensionDialog} cancelClicked={this.closeDialogExtension} />

        <div id="layout" className="bounds">
          {localUser !== undefined && localUser.getStreamManager() !== undefined && (
            <div className="OT_root OT_publisher custom-class" id="localUser">
              <StreamComponent user={localUser} handleNickname={this.nicknameChanged} />
            </div>
          )}
          {this.state.subscribers.map((sub, i) => (
            <div key={i} className="OT_root OT_publisher custom-class" id="remoteUsers">
              <StreamComponent user={sub} streamId={sub.streamManager.stream.streamId} />
            </div>
          ))}
          {localUser !== undefined && localUser.getStreamManager() !== undefined && (
            <div className="OT_root OT_publisher custom-class" style={chatDisplay}>
              <ChatComponent
                user={localUser}
                chatDisplay={this.state.chatDisplay}
                close={this.toggleChat}
                messageReceived={this.checkNotification}
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  /**
   * --------------------------
   * SERVER-SIDE RESPONSIBILITY
   * --------------------------
   * These methods retrieve the mandatory user token from OpenVidu Server.
   * This behaviour MUST BE IN YOUR SERVER-SIDE IN PRODUCTION (by using
   * the API REST, openvidu-java-client or openvidu-node-client):
   *   1) Initialize a session in OpenVidu Server	(POST /api/sessions)
   *   2) Generate a token in OpenVidu Server		(POST /api/tokens)
   *   3) The token must be consumed in Session.connect() method
   */

  getToken() {
    return this.createSession(this.state.mySessionId).then((sessionId) => this.createToken(sessionId));
  }

  connectToSession() {
    const { mySessionId, authToken } = this.state;

    if (this.props.token !== undefined) {
      console.log('token received: ', this.props.token);
      this.connect(this.props.token);
    } else {
      this.getToken()
        .then((token) => {
          console.log('TOKEN:', token);

          if (this.isProvider) {
            fetch('https://20200810t211851-dot-watutors-1.uc.r.appspot.com/v2/session/paid/scheduled/call_event', {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${authToken}`,
                'Content-Type': 'application/json',
              },
              body: {
                sid: mySessionId,
                newState: 'started',
              },
            });
          }

          this.connect(token);
        })
        .catch((error) => {
          if (this.props.error) {
            this.props.error({
              error: error.error, messgae: error.message, code: error.code, status: error.status,
            });
          }
          console.log('There was an error getting the token:', error.code, error.message);
          alert('There was an error getting the token:', error.message);
        });
    }
  }

  joinSession() {
    this.OV = new OpenVidu();

    this.setState(
      {
        session: this.OV.initSession(),
      },
      () => {
        this.subscribeToStreamCreated();

        this.connectToSession();
      },
    );
  }

  createSession(sessionId) {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify({ customSessionId: sessionId });
      axios
        .post(`${this.OPENVIDU_SERVER_URL}/api/sessions`, data, {
          headers: {
            Authorization: `Basic ${btoa(`OPENVIDUAPP:${this.OPENVIDU_SERVER_SECRET}`)}`,
            'Content-Type': 'application/json',
          },
        })
        .then((response) => {
          resolve(response.data.id);
        })
        .catch((response) => {
          const error = { ...response };
          if (error.response && error.response.status === 409) {
            resolve(sessionId);
          } else {
            console.log(error);
            console.warn(
              `No connection to OpenVidu Server. This may be a certificate error at ${this.OPENVIDU_SERVER_URL}`,
            );
            if (
              window.confirm(
                `No connection to OpenVidu Server. This may be a certificate error at "${
                this.OPENVIDU_SERVER_URL
                }"\n\nClick OK to navigate and accept it. `
                + `If no certificate warning is shown, then check that your OpenVidu Server is up and running at "${
                this.OPENVIDU_SERVER_URL
                }"`,
              )
            ) {
              window.location.assign(`${this.OPENVIDU_SERVER_URL}/accept-certificate`);
            }
          }
        });
    });
  }

  createToken(sessionId) {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify({ session: sessionId });
      axios
        .post(`${this.OPENVIDU_SERVER_URL}/api/tokens`, data, {
          headers: {
            Authorization: `Basic ${btoa(`OPENVIDUAPP:${this.OPENVIDU_SERVER_SECRET}`)}`,
            'Content-Type': 'application/json',
          },
        })
        .then((response) => {
          console.log('TOKEN', response);
          resolve(response.data.token);
        })
        .catch((error) => reject(error));
    });
  }
}
export default VideoRoomComponent;
