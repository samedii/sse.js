/**
 * Copyright (C) 2016 Maxime Petazzoni <maxime.petazzoni@bulix.org>.
 * All rights reserved.
 */

var SSE = function (url, options) {
  if (!(this instanceof SSE)) {
    return new SSE(url, options);
  }

  this.INITIALIZING = -1;
  this.CONNECTING = 0;
  this.OPEN = 1;
  this.CLOSED = 2;

  this.url = url;

  options = options || {};
  this.headers = options.headers || {};
  this.payload = options.payload;
  this.method = options.method || (this.payload && 'POST' || 'GET');

  this.fieldSeparator = ':';
  this.listeners = {};

  this.xhr = null;
  this.readyState = this.INITIALIZING;
  this.progress = 0;

  this.addEventListener = function(type, listener) {
    if (this.listeners[type] === undefined) {
      this.listeners[type] = [];
    }

    if (this.listeners[type].indexOf(listener) === -1) {
      this.listeners[type].push(listener);
    }
  };

  this.removeEventListener = function(type, listener) {
    if (this.listeners[type] === undefined) {
      return;
    }

    var filtered = [];
    this.listeners[type].forEach(function(element) {
      if (element !== listener) {
        filtered.push(element);
      }
    });
    if (filtered.length === 0) {
      delete this.listeners[type];
    } else {
      this.listeners[type] = filtered;
    }
  };

  this.dispatchEvent = function(e) {
    if (!e) {
      return true;
    }

    e.target = this;

    var onHandler = 'on' + e.type;
    if (this.hasOwnProperty(onHandler)) {
      this[onHandler].call(this, e);
      if (e.defaultPrevented) {
        return false;
      }
    }

    if (this.listeners[e.type]) {
      return this.listeners[e.type].every(function(callback) {
        callback(e);
        return !e.defaultPrevented;
      });
    }

    return true;
  };

  this._setReadyState = function (state) {
    var event = new Event('readystatechange');
    event.readyState = state;
    this.readyState = state;
    this.dispatchEvent(event);
  };

  this._onStreamFailure = function(e) {
    this.dispatchEvent(new Event('error'));
    this.close();
  }

  this._onStreamProgress = function(e) {
    if (this.xhr.status !== 200) {
      this._onStreamFailure(e);
      return;
    }

    if (this.readyState == this.CONNECTING) {
      this.dispatchEvent(new Event('open'));
      this._setReadyState(this.OPEN);
    }

    var chunk = '';
    var data = this.xhr.responseText.substring(this.progress);
    this.progress += data.length;
    data.split(/\n|\r\n|\r/).forEach(function(line) {
      if (line.length === 0) {
        this.dispatchEvent(this._parseEventChunk(chunk));
        chunk = '';
      } else {
        chunk += line + '\n';
      }
    }.bind(this));
    this.dispatchEvent(this._parseEventChunk(chunk));
  };

  /**
   * Parse a received SSE event chunk into a constructed event object.
   */
  this._parseEventChunk = function(chunk) {
    if (!chunk) {
      return null;
    }

    var e = {'id': null, 'retry': null, 'data': '', 'event': 'message'};
    chunk.split('\n').forEach(function(line) {
      line = line.trimRight();
      var index = line.indexOf(this.fieldSeparator);
      if (index <= 0) {
        // Line was either empty, or started with a separator and is a comment.
        // Either way, ignore.
        return;
      }

      var field = line.substring(0, index);
      if (!(field in e)) {
        return;
      }

      var value = line.substring(index + 1).trimLeft();
      if (field === 'data') {
        e[field] += value;
      } else {
        e[field] = value;
      }
    }.bind(this));

    var event = new Event(e.event);
    event.data = e.data;
    event.id = e.id;
    return event;
  };

  this.stream = function() {
    this._setReadyState(this.CONNECTING);

    this.xhr = new XMLHttpRequest();
    this.xhr.addEventListener('progress', this._onStreamProgress.bind(this));
    this.xhr.addEventListener('load', this._onStreamProgress.bind(this));
    this.xhr.addEventListener('error', this._onStreamFailure.bind(this));
    this.xhr.addEventListener('abort', this._onStreamFailure.bind(this));
    this.xhr.open(this.method, this.url);
    for (var header in this.headers) {
      this.xhr.setRequestHeader(header, this.headers[header]);
    }
    this.xhr.send(this.payload);
  };

  this.close = function() {
    if (this.readyState !== this.CLOSED) {
      return;
    }

    this.xhr.abort();
    this.xhr = null;
    this._setReadyState(this.CLOSED);
  };
};

// Export our SSE module for npm.js
if (exports !== undefined) {
  exports.SSE = SSE;
}
