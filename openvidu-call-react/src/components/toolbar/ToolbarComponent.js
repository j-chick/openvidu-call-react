import React, { Component } from 'react';
import './ToolbarComponent.css';

import AppBar from '@material-ui/core/AppBar';
import Toolbar from '@material-ui/core/Toolbar';

import Mic from '@material-ui/icons/Mic';
import MicOff from '@material-ui/icons/MicOff';
import Videocam from '@material-ui/icons/Videocam';
import VideocamOff from '@material-ui/icons/VideocamOff';
import Fullscreen from '@material-ui/icons/Fullscreen';
import FullscreenExit from '@material-ui/icons/FullscreenExit';
import PictureInPicture from '@material-ui/icons/PictureInPicture';
import ScreenShare from '@material-ui/icons/ScreenShare';
import StopScreenShare from '@material-ui/icons/StopScreenShare';
import CallEnd from '@material-ui/icons/CallEnd';
import QuestionAnswer from '@material-ui/icons/QuestionAnswer';
import FlipCameraIosIcon from '@material-ui/icons/FlipCameraIos';

import IconButton from '@material-ui/core/IconButton';

export default class ToolbarComponent extends Component {
  constructor(props) {
    super(props);
    this.state = { fullscreen: false };
    this.toggleCamera = this.toggleCamera.bind(this);
    this.camStatusChanged = this.camStatusChanged.bind(this);
    this.micStatusChanged = this.micStatusChanged.bind(this);
    this.screenShare = this.screenShare.bind(this);
    this.stopScreenShare = this.stopScreenShare.bind(this);
    this.toggleFullscreen = this.toggleFullscreen.bind(this);
    this.leaveSession = this.leaveSession.bind(this);
    this.toggleChat = this.toggleChat.bind(this);
  }

  toggleCamera() {
    this.props.toggleCamera();
  }

  micStatusChanged() {
    this.props.micStatusChanged();
  }

  camStatusChanged() {
    this.props.camStatusChanged();
  }

  screenShare() {
    this.props.screenShare();
  }

  stopScreenShare() {
    this.props.stopScreenShare();
  }

  toggleFullscreen() {
    this.setState({ fullscreen: !this.state.fullscreen });
    this.props.toggleFullscreen();
  }

  leaveSession() {
    this.props.leaveSession();
  }

  toggleChat() {
    this.props.toggleChat();
  }

  render() {
    const localUser = this.props.user;
    const { isMobile, showNotification } = this.props;

    return (
      <AppBar
        className="appbar"
        position="fixed"
        style={{
          top: 'auto',
          backgroundColor: '#282c33',
          position: 'fixed',
          bottom: 0,
          width: '100%',
        }}
      >
        <Toolbar className="toolbar">
          <div className="buttonsContent">
            <IconButton color="default" className="navButton" id="navMicButton" onClick={this.micStatusChanged}>
              {localUser !== undefined && localUser.isAudioActive()
                ? <Mic id="icon" />
                : <MicOff id="icon" style={{ color: '#fa282d' }} />}
            </IconButton>
            <IconButton color="default" className="navButton" id="navCamButton" onClick={this.camStatusChanged}>
              {localUser !== undefined && localUser.isVideoActive() ? (
                <Videocam id="icon" />
              ) : (
                <VideocamOff id="icon" style={{ color: '#fa282d' }} />
              )}
            </IconButton>
            <IconButton color="inherit" className="navButton" onClick={this.leaveSession} id="navLeaveButton">
              <CallEnd id="icon" style={{ color: 'white' }} />
            </IconButton>
            {isMobile ? (
              <IconButton color="inherit" className="navButton" id="navFlipButton" onClick={this.toggleCamera}>
                <FlipCameraIosIcon id="icon" />
              </IconButton>
            ) : (
              <IconButton color="default" className="navButton" onClick={this.screenShare} id="navScreenButton">
                {localUser !== undefined && localUser.isScreenShareActive()
                  ? <PictureInPicture id="icon" />
                  : <ScreenShare id="icon" />}
              </IconButton>
            )}
            {localUser !== undefined &&
              localUser.isScreenShareActive() && (
                <IconButton onClick={this.stopScreenShare} id="navScreenButton">
                  <StopScreenShare color="secondary" id="icon" />
                </IconButton>
            )}
            {isMobile ? (
              <IconButton color="default" className="navButton" onClick={() => this.toggleChat()}>
                {showNotification && <div id="point" />}
                <QuestionAnswer id="icon" />
              </IconButton>
            ) : (
              <IconButton color="default" className="navButton" onClick={this.toggleFullscreen}>
                {localUser !== undefined && this.state.fullscreen
                  ? <FullscreenExit id="icon" />
                  : <Fullscreen id="icon" />}
              </IconButton>
            )}
          </div>
        </Toolbar>
      </AppBar>
    );
  }
}
