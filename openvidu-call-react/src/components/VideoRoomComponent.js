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
const API_BASE_URL = 'https://v2-0-34-dot-watutors-1.uc.r.appspot.com/v2';

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
      sid, name, isProvider, token, type,
    } = params;

    this.isProvider = isProvider === 'true';
    this.sessionType = type;

    this.state = {
      mySessionId: sid,
      myUserName: name,
      session: undefined,
      localUser: undefined,
      subscribers: [],
      chatDisplay: 'none',
      authToken: token,
      ended: false,
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
            mirror: !isFrontCamera,
          });

          session.unpublish(localUser.getStreamManager());

          localUser.setStreamManager(newPublisher);

          session.publish(newPublisher)
            .then(() => {
              localUser.setFrontCamera(!isFrontCamera);

              this.setState({ localUser }, () => {
                this.sendSignalUserChanged({ isFrontCamera: !isFrontCamera });
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
    const { mySessionId, authToken, subscribers } = this.state;

    const mySession = this.state.session;

    if ((mySession && this.sessionType !== 'free_private_timed') || subscribers.length === 0) {
      fetch(`${API_BASE_URL}/session/paid/scheduled/call_event`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          sid: mySessionId,
          newState: 'ended',
        }),
      });

      mySession.disconnect();
    }

    // Empty all properties...
    this.OV = null;
    this.setState({
      ended: true,
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
    const {
      mySessionId, subscribers, localUser, ended,
    } = this.state;
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
          {localUser !== undefined && localUser.getStreamManager() !== undefined ? (
            <div className="OT_root OT_publisher custom-class" id="localUser">
              <StreamComponent user={localUser} handleNickname={this.nicknameChanged} />
            </div>
          ) : ended && (
            <div style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
            }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="300"
                height="300"
                viewBox="0 0 512 512"
                style={{ width: '100%' }}
              >
                <linearGradient
                  id="SVGID_1_"
                  x1="23.821"
                  x2="459.531"
                  y1="336.331"
                  y2="84.774"
                  gradientUnits="userSpaceOnUse"
                >
                  <stop offset="0" stopColor="#dcfdee" stopOpacity="0" />
                  <stop offset="0.629" stopColor="#d2f3e4" />
                </linearGradient>
                <path
                  fill="url(#SVGID_1_)"
                  d="M16.074 295.943c18.727 64.003 72.707 194.564 163.922 182.845 91.486-11.755 55.759-129.725 139.508-145.894 36.867-7.118 61.857 56.689 98.806 54.704 47.588-2.557 71.81-49.663 85.108-89.264 28.197-83.968-14.029-226.352-112.859-251.012-86.244-21.519-96.332 83.855-171.322 53.248-42.149-17.203-37.938-68.576-89.272-78.942C-25.333-9.731-8.845 210.778 16.074 295.943z"
                />
                <path
                  fill="#2626bc"
                  d="M350.232 493.402H161.768c-16.569 0-30-13.431-30-30V82.723c0-16.569 13.431-30 30-30h188.464c16.569 0 30 13.431 30 30v380.678c0 16.569-13.431 30.001-30 30.001z"
                  opacity="0.1"
                />
                <path
                  fill="#6583fe"
                  d="M350.232 469.402H161.768c-16.569 0-30-13.431-30-30V58.723c0-16.569 13.431-30 30-30h188.464c16.569 0 30 13.431 30 30v380.678c0 16.569-13.431 30.001-30 30.001z"
                />
                <path fill="#2d58e0" d="M131.77 71.632h248.46v354.86H131.77z" />
                <path
                  fill="#1f50c9"
                  d="M239.225 201.915h-50.943c-5.523 0-10-4.477-10-10v-47.011c0-5.523 4.477-10 10-10h50.943c5.523 0 10 4.477 10 10v47.011c0 5.523-4.477 10-10 10zM324.144 201.633h-50.943c-5.523 0-10-4.477-10-10v-47.011c0-5.523 4.477-10 10-10h50.943c5.523 0 10 4.477 10 10v47.011c0 5.523-4.477 10-10 10zM379.948 134.622v67.01h-21.55c-5.52 0-10-4.48-10-10v-47.01c0-5.52 4.48-10 10-10z"
                />
                <path
                  fill="#fff"
                  d="M309.84 93.061H202.16a5 5 0 000 10h107.68a5 5 0 000-10z"
                />
                <path
                  fill="#ff7eb8"
                  d="M239.225 191.403h-50.943c-5.523 0-10-4.477-10-10v-47.011c0-5.523 4.477-10 10-10h50.943c5.523 0 10 4.477 10 10v47.011c0 5.523-4.477 10-10 10z"
                />
                <g fill="#fff">
                  <path d="M228.594 170.507h-20.681a5 5 0 000 10h20.681a5 5 0 000-10zM228.594 154.177h-5.681a5 5 0 000 10h5.681a5 5 0 000-10z" />
                </g>
                <path
                  fill="#02ffb3"
                  d="M324.144 191.122h-50.943c-5.523 0-10-4.477-10-10V134.11c0-5.523 4.477-10 10-10h50.943c5.523 0 10 4.477 10 10v47.011c0 5.523-4.477 10.001-10 10.001z"
                />
                <g fill="#fff">
                  <path d="M313.513 170.226h-20.681a5 5 0 000 10h20.681a5 5 0 000-10zM313.513 153.895h-5.681a5 5 0 000 10h5.681a5 5 0 000-10z" />
                </g>
                <path
                  fill="#9fb0fe"
                  d="M379.948 124.111v67.01h-21.55c-5.52 0-10-4.48-10-10v-47.01c0-5.52 4.48-10 10-10z"
                />
                <path
                  fill="#fff"
                  d="M131.77 426.492v-184.74c0-13.8 11.19-25 25-25h198.46c13.81 0 25 11.2 25 25v184.74z"
                />
                <path
                  fill="#2626bc"
                  d="M350.232 474.401H161.768c-19.299 0-35-15.701-35-35V58.724c0-19.299 15.701-35 35-35h188.464c19.299 0 35 15.701 35 35v380.678c0 19.298-15.701 34.999-35 34.999zM161.768 33.724c-13.785 0-25 11.215-25 25v380.678c0 13.785 11.215 25 25 25h188.464c13.785 0 25-11.215 25-25V58.724c0-13.785-11.215-25-25-25z"
                />
                <g>
                  <path
                    fill="#b7c5ff"
                    d="M273.483 56.094h-34.966a5 5 0 010-10h34.966a5 5 0 010 10z"
                  />
                </g>
                <circle cx="296.813" cy="51.092" r="5.002" fill="#b7c5ff" />
                <g>
                  <path
                    fill="#00d890"
                    d="M234.594 249.062h-20.681a5 5 0 000 10h20.681a5 5 0 000-10z"
                  />
                  <path
                    fill="#9fb0fe"
                    d="M336.594 269.335H213.913a5 5 0 000 10h122.681a5 5 0 000-10z"
                  />
                  <path
                    fill="#02ffb3"
                    d="M184.926 279.335h-20.272a5 5 0 01-5-5v-20.272a5 5 0 015-5h20.272a5 5 0 015 5v20.272a5 5 0 01-5 5z"
                  />
                </g>
                <g>
                  <path
                    fill="#ff5ba8"
                    d="M234.594 311.006h-20.681a5 5 0 000 10h20.681a5 5 0 000-10z"
                  />
                  <path
                    fill="#9fb0fe"
                    d="M336.594 331.278H213.913a5 5 0 000 10h122.681a5 5 0 000-10z"
                  />
                  <path
                    fill="#ff7eb8"
                    d="M184.926 341.278h-20.272a5 5 0 01-5-5v-20.272a5 5 0 015-5h20.272a5 5 0 015 5v20.272a5 5 0 01-5 5z"
                  />
                </g>
                <g>
                  <path
                    fill="#6583fe"
                    d="M234.594 372.949h-20.681a5 5 0 000 10h20.681a5 5 0 000-10z"
                  />
                  <path
                    fill="#9fb0fe"
                    d="M336.594 393.221H213.913a5 5 0 000 10h122.681a5 5 0 000-10zM184.926 403.221h-20.272a5 5 0 01-5-5v-20.272a5 5 0 015-5h20.272a5 5 0 015 5v20.272a5 5 0 01-5 5z"
                  />
                </g>
                <path
                  fill="#6583fe"
                  d="M418.336 397.24c-7.88 0-14.291-6.411-14.291-14.292s6.411-14.292 14.291-14.292 14.291 6.411 14.291 14.292-6.411 14.292-14.291 14.292zm0-18.583c-2.366 0-4.291 1.925-4.291 4.292s1.925 4.292 4.291 4.292 4.291-1.925 4.291-4.292-1.925-4.292-4.291-4.292z"
                />
                <path
                  fill="#01eca5"
                  d="M82.919 184.409a5 5 0 01-5-5c0-3.309-2.691-6-6-6a5 5 0 010-10c3.309 0 6-2.691 6-6a5 5 0 0110 0c0 3.309 2.691 6 6 6a5 5 0 010 10c-3.309 0-6 2.691-6 6a5 5 0 01-5 5zM432.652 442.493a5 5 0 01-5-5c0-3.309-2.691-6-6-6a5 5 0 110-10c3.309 0 6-2.691 6-6a5 5 0 1110 0c0 3.309 2.691 6 6 6a5 5 0 110 10c-3.309 0-6 2.691-6 6a5 5 0 01-5 5z"
                />
                <g fill="#ff5ba8">
                  <path d="M443.652 150.622a5 5 0 01-5-5c0-3.309-2.691-6-6-6a5 5 0 110-10c3.309 0 6-2.691 6-6a5 5 0 1110 0c0 3.309 2.691 6 6 6a5 5 0 110 10c-3.309 0-6 2.691-6 6a5 5 0 01-5 5zM72.627 233.706a5 5 0 01-5-5c0-3.309-2.691-6-6-6a5 5 0 010-10c3.309 0 6-2.691 6-6a5 5 0 0110 0c0 3.309 2.691 6 6 6a5 5 0 010 10c-3.309 0-6 2.691-6 6a5 5 0 01-5 5z" />
                </g>
              </svg>
              <p style={{ textAlign: 'center', color: 'white', fontSize: 24 }}>
                Session has ended, you may now return to the app.
              </p>
            </div>
          )}
          {subscribers.map((sub, i) => (
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
          if (this.isProvider) {
            fetch(`${API_BASE_URL}/session/paid/scheduled/call_event`, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${authToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                sid: mySessionId,
                newState: 'started',
              }),
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
                `No connection to OpenVidu Server. This may be a certificate error at "${this.OPENVIDU_SERVER_URL
                }"\n\nClick OK to navigate and accept it. `
                + `If no certificate warning is shown, then check that your OpenVidu Server is up and running at "${this.OPENVIDU_SERVER_URL
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
