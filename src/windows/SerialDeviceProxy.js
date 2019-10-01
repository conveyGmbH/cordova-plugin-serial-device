    /*
     * Copyright (c) Microsoft Open Technologies, Inc. All rights reserved.
     *
     * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at
     *
     * http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
     */
    "use strict";

    var DeviceConstants = {
        connectionStatus: {
            none: "none",
            connecting: "connecting",
            connected: "connected",
            read: "read",
            write: "write",
            readwrite: "readwrite",
            disconnecting: "disconnecting",
            disconnected: "disconnected",
            unknown: "error: unknown device",
            unspecified: "error: unspecified",
            deniedByUser: "error: denied by user",
            deniedBySystem: "error: denied by system"
        },
        ioStatus: {
            none: "none",
            read: "read",
            write: "write",
            readwrite: "readwrite",
        },
        deviceType: {
            osrFx2: 0,
            superMutt: 1,
            all: 2,
            none: 3
        },
        descriptor: {
            deviceDescriptor: 0,
            configurationDescriptor: 1,
            interfaceDescriptor: 2,
            endpointDescriptor: 3,
            stringDescriptor: 4,
            customDescriptor: 5
        },
        localSettingKeys: {
            syncBackgroundTaskStatus: "SyncBackgroundTaskStatus",
            syncBackgroundTaskResult: "SyncBackgroundTaskResult"
        },
        syncBackgroundTaskInformation: {
            name: "SyncBackgroundTask",
            taskEntryPoint: "ioSyncBackgroundTask.js",
            taskCanceled: "Canceled",
            taskCompleted: "Completed"
        },
        deviceProperties: {
            deviceInstanceId: "System.Devices.DeviceInstanceId"
        },
        osrFx2: {
            vendorCommand: {
                getSevenSegment: 0xD4,
                getSwitchState: 0xD6,
                setSevenSegment: 0xDB
            },
            pipe:
            {
                interruptInPipeIndex: 0,
                bulkInPipeIndex: 0,
                bulkOutPipeIndex: 0
            },
            sevenLedSegmentMask: [
                0xD7,   // 0
                0x06,   // 1
                0xB3,   // 2
                0xA7,   // 3
                0x66,   // 4
                0xE5,   // 5
                0xF4,   // 6
                0x07,   // 7
                0xF7,   // 8
                0x67    // 0
            ],
            deviceVid: 0x0547,
            devicePid: 0x1002
        },
        superMutt: {
            vendorCommand: {
                getLedBlinkPattern: 0x03,
                setLedBlinkPattern: 0x03
            },
            pipe:
            {
                interruptInPipeIndex: 0,
                interruptOutPipeIndex: 0,
                bulkInPipeIndex: 0,
                bulkOutPipeIndex: 0
            },
            deviceVid: 0x045E,
            devicePid: 0x0611,
            deviceInterfaceClass: "{875D47FC-D331-4663-B339-624001A2DC5E}"
        },
        sync: {
            bytesToWriteAtATime: 512,
            numberOfTimesToWrite: 2
        }
    };

    var OnDeviceConnectedEventArgsClass = WinJS.Class.define(
        function (isDeviceSuccessfullyConnected, deviceInformation, deviceAccessStatus) {
            this._isDeviceSuccessfullyConnected = isDeviceSuccessfullyConnected;
            this._deviceInformation = deviceInformation;
            this._deviceAccessStatus = deviceAccessStatus;
        },
        {
            _isDeviceSuccessfullyConnected: null,
            _deviceInformation: null,
            isDeviceSuccessfullyConnected: {
                get: function() {
                    return this._isDeviceSuccessfullyConnected;
                }
            },
            deviceInformation: {
                get: function() {
                    return this._deviceInformation;
                }
            },
            deviceAccessStatus: {
                get: function() {
                    return this._deviceAccessStatus;
                }
            }
        },
        null
    );
    var DeviceListEntry = WinJS.Class.define(
        // <summary>
        // The class is mainly used as a DeviceInformation wrapper so that the UI can bind to a list of these.
        // </summary>
        // <param name="deviceInformation"></param>
        // <param name="deviceSelector">The AQS used to find this device</param>
        function(deviceInformation, deviceSelector) {
            this._deviceInformation = deviceInformation;
            this._deviceSelector = deviceSelector;
        },
        {
            _deviceInformation: null,
            _deviceSelector: null,
            instanceId: {
                get: function() {
                    return this._deviceInformation.properties[DeviceConstants.deviceProperties
                        .deviceInstanceId
                    ];
                }
            },
            deviceInformation: {
                get: function() {
                    return this._deviceInformation;
                }
            },
            deviceSelector: {
                get: function() {
                    return this._deviceSelector;
                }
            }
        },
        null
    );

    var deviceConnections = {};
    // <summary>
    // The purpose of this class is to demonstrate what to do to a SerialDevice when a specific app event
    // is raised (app suspension and resume) or when the device is disconnected.
    //
    // This class will also demonstrate how to handle device watcher events.
    //
    // In order to make this class support multiple devices, create multiple instances
    // of this class; each instance should watch one connected device.
    // </summary>
    var EventHandlerForDeviceClass = WinJS.Class.define(
    // <summary>
    // If this event handler will be running in a background task, app events will not be registered for because they are of
    // no use to the background task.
    // </summary>
    // <param name="isBackgroundTask">Whether or not the event handler will be running as a background task</param>
    function (isBackgroundTask) {
        this._isBackgroundTask = !!isBackgroundTask;
    }, {
        _onDeviceAccessChangedBound: null,
        _onDeviceAddedBound: null,
        _onDeviceRemovedBound: null,
        _onAppResumeBound: null,
        _onAppSuspensionBound: null,
        _appSuspendCallback: null,
        _deviceCloseCallback: null,
        _deviceConnectedCallback: null,
        _deviceConnectionStatusCallback: null,
        _deviceIoStatusCallback: null,
        _deviceWatcher: null,
        _deviceSelector: null,
        _deviceInformation: null,
        _deviceAccessInformation: null,
        _device: null,
        _watcherSuspended: false,
        _watcherStarted: false,
        _isBackgroundTask: false,
        _isEnabledAutoReconnect: true,
        _isRegisteredForAppEvents: false,
        _isRegisteredForDeviceAccessStatusChangeEvents: false,
        onAppSuspendCallback: {
            get: function () {
                return this._appSuspendCallback;
            },
            set: function (newSuspensionHandler) {
                this._appSuspendCallback = newSuspensionHandler;
            }
        },
        onDeviceCloseCallback: {
            get: function () {
                return this._deviceCloseCallback;
            },
            set: function (newHandler) {
                this._deviceCloseCallback = newHandler;
            }
        },
        onDeviceConnectedCallback: {
            get: function () {
                return this._deviceConnectedCallback;
            },
            set: function (newHandler) {
                this._deviceConnectedCallback = newHandler;
            }
        },
        onDeviceConnectionStatusCallback: {
            get: function() {
                return this._deviceConnectionStatusCallback;
            },
            set: function (newHandler) {
                this._deviceConnectionStatusCallback = newHandler;
            }
        },
        onDeviceIoStatusCallback: {
            get: function() {
                return this._deviceIoStatusCallback;
            },
            set: function (newHandler) {
                this._deviceIoStatusCallback = newHandler;
            }
        },
        isDeviceConnected: {
            get: function () {
                return this._device !== null;
            }
        },
        device: {
            get: function () {
                return this._device;
            }
        },
        // <summary>
        // This DeviceInformation represents which device is connected or which device will be reconnected when
        // the device is plugged in again (if IsEnabledAutoReconnect is true);.
        // </summary>
        deviceInformation: {
            get: function () {
                return this._deviceInformation;
            }
        },
        // <summary>
        // Returns DeviceAccessInformation for the device that is currently connected using this EventHandlerForDevice
        // object.
        // </summary>
        deviceAccessInformation: {
            get: function () {
                return this._deviceAccessInformation;
            }
        },
        // <summary>
        // True if EventHandlerForDevice will attempt to reconnect to the device once it is plugged into the computer again
        // </summary>
        isEnabledAutoReconnect: {
            get: function () {
                return this._isEnabledAutoReconnect;
            },
            set: function (value) {
                this._isEnabledAutoReconnect = value;
            }
        },
        // <summary>
        // DeviceSelector AQS used to find this device
        // </summary>
        deviceSelector: {
            get: function () {
                return this._deviceSelector;
            }
        },
        // <summary>
        // This method opens the device using the WinRT Serial API. After the device is opened, we will save the device
        // so that it can be used across scenarios.
        //
        // This method is used to reopen the device after the device reconnects to the computer and when the app resumes.
        // </summary>
        // <param name="deviceInfo">Device information of the device to be opened</param>
        // <param name="deviceSelector">The AQS used to find this device</param>
        // <returns>A promise with value of True if the device was successfully opened, false if the device could not be opened for well known reasons.
        // An exception may be thrown if the device could not be opened for extraordinary reasons.</returns>
        openDeviceAsync: function (deviceInfo, deviceSelector) {
            var that = this;
                return Windows.Devices.SerialCommunication.SerialDevice.fromIdAsync(deviceInfo.id).then(function (serialDevice) {
                    var successfullyOpenedDevice = false;
                    var deviceAccessStatus = Windows.Devices.Enumeration.DeviceAccessStatus.unspecified;

                    // Device could have been blocked by user or the device has already been opened by another app.
                    if (serialDevice) {
                        WinJS.log && WinJS.log("Device " + deviceInfo.id + " opened", "sample", "status");

                        successfullyOpenedDevice = true;
                        deviceAccessStatus = Windows.Devices.Enumeration.DeviceAccessStatus.allowed;

                        that._deviceInformation = deviceInfo;
                        that._deviceSelector = deviceSelector;

                        that._device = serialDevice;

                        // Background tasks are not part of the app, so app events will not have an affect on the device
                        if (!that._isBackgroundTask && !that._isRegisteredForAppEvents) {
                            that._registerForAppEvents();
                        }

                        // User can block the device after it has been opened in the Settings charm. We can detect this by registering for the
                        // DeviceAccessInformation.accessChanged event
                        if (!that._deviceAccessInformation) {
                            that._registerForDeviceAccessStatusChange();
                        }

                        // Create and register device watcher events for the device to be opened unless we're reopening the device
                        if (!that._deviceWatcher) {
                            that._deviceWatcher = Windows.Devices.Enumeration.DeviceInformation.createWatcher(deviceSelector, null);

                            that._registerForDeviceWatcherEvents();
                        }

                        if (!that._watcherStarted) {
                            // Start the device watcher after we made sure that the device is opened.
                            that._startDeviceWatcher();
                        }
                        if (that._deviceConnectionStatusCallback) {
                            that._deviceConnectionStatusCallback(DeviceConstants.connectionStatus.connected);
                        }
                    } else {
                        successfullyOpenedDevice = false;
                        deviceAccessStatus = Windows.Devices.Enumeration.DeviceAccessInformation.createFromId(deviceInfo.id).currentStatus;

                        switch (deviceAccessStatus) {
                            case Windows.Devices.Enumeration.DeviceAccessStatus.deniedByUser:
                                WinJS.log && WinJS.log("Access to the device was blocked by the user : " + deviceInfo.id, "sample", "error");
                                if (that._deviceConnectionStatusCallback) {
                                    that._deviceConnectionStatusCallback(DeviceConstants.connectionStatus.deniedByUser);
                                }
                                break;
                            case Windows.Devices.Enumeration.DeviceAccessStatus.deniedBySystem:
                                // This status is most likely caused by app permissions (did not declare the device in the app's package.appxmanifest)
                                // This status does not cover the case where the device is already opened by another app.
                                WinJS.log && WinJS.log("Access to the device was blocked by the system : " + deviceInfo.id, "sample", "error");
                                if (that._deviceConnectionStatusCallback) {
                                    that._deviceConnectionStatusCallback(DeviceConstants.connectionStatus.deniedBySystem);
                                }
                                break;
                            default:
                                // Most likely the device is opened by another app, but cannot be sure
                                WinJS.log && WinJS.log("Unknown error, possibly opened by another app : " + deviceInfo.id, "sample", "error");
                                if (that._deviceConnectionStatusCallback) {
                                    that._deviceConnectionStatusCallback(DeviceConstants.connectionStatus.unspecified);
                                }
                                break;
                        }
                    }

                    // Notify registered callback handle that the device has been opened
                    if (that._deviceConnectedCallback) {
                        var deviceConnectedEventArgs = new OnDeviceConnectedEventArgsClass(successfullyOpenedDevice, that._deviceInformation, deviceAccessStatus);

                        that._deviceConnectedCallback(deviceConnectedEventArgs);
                    }

                    return successfullyOpenedDevice;
                });
            },
            // <summary>
            // Closes the device, stops the device watcher, stops listening for app events, and resets object state to before a device
            // was ever connected.
            // </summary>
            closeDevice: function () {
                if (this.isDeviceConnected) {
                    this._closeCurrentlyConnectedDevice();
                }

                if (this._deviceWatcher) {
                    if (this._watcherStarted) {
                        this._stopDeviceWatchers();

                        this._unregisterFromDeviceWatcherEvents();
                    }

                    this._deviceWatcher = null;
                }

                if (this._deviceAccessInformation) {
                    this._unregisterFromDeviceAccessStatusChange();

                    this._deviceAccessInformation = null;
                }

                this._unregisterFromAppEvents();

                this._deviceInformation = null;
                this._deviceSelector = null;

                this._deviceConnectedCallback = null;
                this._deviceCloseCallback = null;
                this._appSuspendCallback = null;

                this._isEnabledAutoReconnect = true;
            },
            // <summary>
            // This method demonstrates how to close the device properly using the WinRT Serial API.
            //
            // When the SerialDevice is closing, it will cancel all IO operations that are still pending (not complete).
            // The close will not wait for any IO completion callbacks to be called, so the close call may complete before any of
            // the IO completion callbacks are called.
            // The pending IO operations will still call their respective completion callbacks with either a task
            // cancelled error or the operation completed.
            // </summary>
            _closeCurrentlyConnectedDevice: function (bSuspend) {
                if (this._device) {
                    // Notify callback that we're about to close the device
                    if (this._deviceConnectionStatusCallback) {
                        this._deviceConnectionStatusCallback(DeviceConstants.connectionStatus.disconnecting);
                    }
                    if (this._deviceCloseCallback) {
                        this._deviceCloseCallback(this._deviceInformation);
                    }
                    if (!bSuspend) {
                        // don't close the device on suspend!
                        this._device.close();
                    }
                    this._device = null;

                    WinJS.log && WinJS.log(this._deviceInformation.id + " is closed", "sample", "status");
                    if (this._deviceConnectionStatusCallback) {
                        this._deviceConnectionStatusCallback(DeviceConstants.connectionStatus.disconnected);
                    }
                }
            },
            // <summary>
            // Register for app suspension/resume events. See the comments
            // for the event handlers for more information on what is being done to the device.
            //
            // We will also register for when the app exists so that we may close the device handle.
            // </summary>
            _registerForAppEvents: function () {
                // This event is raised when the app is exited and when the app is suspended
                this._onAppSuspensionBound = this._onAppSuspension.bind(this);
                Windows.UI.WebUI.WebUIApplication.addEventListener("pause", this._onAppSuspensionBound);

                this._onAppResumeBound = this._onAppResume.bind(this);
                Windows.UI.WebUI.WebUIApplication.addEventListener("resume", this._onAppResumeBound);
            },
            _unregisterFromAppEvents: function () {
                // This event is raised when the app is exited and when the app is suspended
                Windows.UI.WebUI.WebUIApplication.removeEventListener("pause", this._onAppSuspensionBound);
                this._onAppSuspensionBound = null;

                Windows.UI.WebUI.WebUIApplication.removeEventListener("resume", this._onAppResumeBound);
                this._onAppResumeBound = null;
            },
            // <summary>
            // Register for Added and Removed events.
            // Note that, when disconnecting the device, the device may be closed by the system before the OnDeviceRemoved callback is invoked.
            // </summary>
            _registerForDeviceWatcherEvents: function () {
                if (this._deviceWatcher) {
                    this._onDeviceAddedBound = this._onDeviceAdded.bind(this);
                    this._deviceWatcher.addEventListener("added", this._onDeviceAddedBound, false);
                    this._onDeviceRemovedBound = this._onDeviceRemoved.bind(this);
                    this._deviceWatcher.addEventListener("removed", this._onDeviceRemovedBound, false);
                }
            },
            _unregisterFromDeviceWatcherEvents: function () {
                if (this._deviceWatcher) {
                    this._deviceWatcher.removeEventListener("added", this._onDeviceAddedBound);
                    this._onDeviceAddedBound = null;
                    this._deviceWatcher.removeEventListener("removed", this._onDeviceRemovedBound);
                    this._onDeviceRemovedBound = null;
                }
            },
            // <summary>
            // Listen for any changed in device access permission. The user can block access to the device while the device is in use.
            // If the user blocks access to the device while the device is opened, the device's handle will be closed automatically by
            // the system; it is still a good idea to close the device explicitly so that resources are cleaned up.
            //
            // Note that by the time the AccessChanged event is raised, the device handle may already be closed by the system.
            // </summary>
            _registerForDeviceAccessStatusChange: function () {
                // Enable the following registration ONLY if the Serial device under test is non-internal.
                //
                this._deviceAccessInformation = Windows.Devices.Enumeration.DeviceAccessInformation.createFromId(this._deviceInformation.id);

                this._onDeviceAccessChangedBound = this._onDeviceAccessChanged;
                this._deviceAccessInformation.addEventListener("accesschanged", this._onDeviceAccessChangedBound, false);
            },
            _unregisterFromDeviceAccessStatusChange: function () {
                this._deviceAccessInformation.removeEventListener("accesschanged", this._onDeviceAccessChangedBound);
                this._onDeviceAccessChangedBound = null;
            },
            _startDeviceWatcher: function () {
                if (this._deviceWatcher) {
                    this._watcherStarted = true;

                    if (this._deviceWatcher.status !== Windows.Devices.Enumeration.DeviceWatcherStatus.started
                        && this._deviceWatcher.status !== Windows.Devices.Enumeration.DeviceWatcherStatus.enumerationCompleted) {
                        this._deviceWatcher.start();
                    }
                }
            },
            _stopDeviceWatchers: function () {
                if (this._deviceWatcher) {
                    if (this._deviceWatcher.status === Windows.Devices.Enumeration.DeviceWatcherStatus.started
                        || this._deviceWatcher.status === Windows.Devices.Enumeration.DeviceWatcherStatus.enumerationCompleted) {
                        this._deviceWatcher.stop();
                    }
                }
                this._watcherStarted = false;
            },
            // <summary>
            // If a SerialDevice object has been instantiated (a handle to the device is opened), we must close it before the app
            // goes into suspension because the API automatically closes it for us if we don't. When resuming, the API will
            // not reopen the device automatically, so we need to explicitly open the device in the app (Scenario1_DeviceConnect).
            //
            // Since we have to reopen the device ourselves when the app resumes, it is good practice to explicitly call the close
            // in the app as well (For every open there is a close).
            //
            // We must stop the DeviceWatcher because it will continue to raise events even if
            // the app is in suspension, which is not desired (drains battery). We resume the device watcher once the app resumes again.
            // </summary>
            // <param name="suspendingEventArgs"></param>
            _onAppSuspension: function (suspendingEventArgs) {
                //var suspendingDeferral = suspendingEventArgs &&
                //    suspendingEventArgs.detail &&
                //    suspendingEventArgs.detail[0] &&
                //    suspendingEventArgs.detail[0].suspendingOperation &&
                //    suspendingEventArgs.detail[0].suspendingOperation.getDeferral();
                if (this._watcherStarted) {
                    this._watcherSuspended = true;
                    this._stopDeviceWatchers();
                } else {
                    this._watcherSuspended = false;
                }

                // Forward suspend event to registered callback function
                if (this._appSuspendCallback) {
                    this._appSuspendCallback(suspendingEventArgs);
                }
                this._closeCurrentlyConnectedDevice(true);
                //if (suspendingDeferral) {
                //    suspendingDeferral.complete();
                //}
            },
            // <summary>
            // When resume into the application, we should reopen a handle to the Serial device again. This will automatically
            // happen when we start the device watcher again; the device will be re-enumerated and we will attempt to reopen it
            // if IsEnabledAutoReconnect property is enabled.
            //
            // See OnAppSuspension for why we are starting the device watcher again
            // </summary>
            // <param name="arg"></param>
            _onAppResume: function (arg) {
                if (this._watcherSuspended) {
                    var that = this;
                    WinJS.Promise.timeout(250).then(function() {
                        that._watcherSuspended = false;
                        that._startDeviceWatcher();
                    })
                }
            },
            // <summary>
            // Close the device that is opened so that all pending operations are canceled properly.
            // </summary>
            // <param name="deviceInformationUpdate"></param>
            _onDeviceRemoved: function (deviceInformationUpdate) {
                if (this.isDeviceConnected && (deviceInformationUpdate.id === this._deviceInformation.id)) {
                    // The main reasons to close the device explicitly is to clean up resources, to properly handle errors,
                    // and stop talking to the disconnected device.
                    this._closeCurrentlyConnectedDevice();
                }
            },
            // <summary>
            // Close the device if the device access was denied by anyone (system or the user) and reopen it if permissions are allowed again
            // </summary>
            // <param name="deviceInformation"></param>
            _onDeviceAdded: function (deviceInformation) {
                if (this._deviceInformation && (deviceInformation.id === this._deviceInformation.id)
                    && !this.isDeviceConnected && this.isEnabledAutoReconnect) {
                    var that = this;
                    // If we failed to reconnect to the device, don't try to connect anymore
                    this.openDeviceAsync(this._deviceInformation, this._deviceSelector)
                        .then(function (openDeviceSuccess) {
                            that.isEnabledAutoReconnect = openDeviceSuccess;
                        });

                    // Any app specific device intialization should be done here because we don't know the state of the device when it is re-enumerated.
                }
            },
            // <summary>
            // Close the device if the device access was denied by anyone (system or the user)
            // </summary>
            // <param name="eventArgs"></param>
            _onDeviceAccessChanged: function (eventArgs) {
                if ((eventArgs.status === Windows.Devices.Enumeration.DeviceAccessStatus.deniedBySystem)
                    || (eventArgs.status === Windows.Devices.Enumeration.DeviceAccessStatus.deniedByUser)) {
                    this._closeCurrentlyConnectedDevice();
                } else if ((eventArgs.status === Windows.Devices.Enumeration.DeviceAccessStatus.allowed) && this._deviceInformation
                    && this.isEnabledAutoReconnect) {
                    var that = this;
                    // If we failed to reconnect to the device, don't try to connect anymore
                    this.openDeviceAsync(this._deviceInformation, this._deviceSelector)
                        .then(function (openDeviceSuccess) {
                            that.isEnabledAutoReconnect = openDeviceSuccess;
                        });

                    // Any app specific device intialization should be done here because we don't know the state of the device when it is re-enumerated.
                }
            }
    },
    null);

    var SerialIoClass = WinJS.Class.define(function (eventHandlerForDevice) {
        this._eventHandlerForDevice = eventHandlerForDevice;
        this._onAppSuspensionBound = this._onAppSuspension.bind(this);
        this._onDeviceConnectedBound = this._onDeviceConnected.bind(this);
        this._eventHandlerForDevice.onAppSuspendCallback = this._onAppSuspensionBound;
        this._eventHandlerForDevice.onDeviceConnectedCallback = this._onDeviceConnectedBound;
    }, {
        _onAppSuspensionBound: null,
        _onDeviceConnectedBound: null,
        _eventHandlerForDevice: null,
        _isReading: false,
        _isWriting: false,
        resultString: "",
        readingPromise: null,
        writingPromise: null,
        totalBytesWritten: 0,
        totalBytesRead: 0,
        dispose: function() {
            if (this._eventHandlerForDevice) {
                this._eventHandlerForDevice.onAppSuspendCallback = null;
                this._eventHandlerForDevice.onDeviceConnectedCallback = null;
                this._onAppSuspensionBound = null;
                this._onDeviceConnectedBound = null;
                this._eventHandlerForDevice = null;
            }
        },
        isReading: {
            get: function() {
                return this._isReading;
            },
            set: function(newState) {
                this._isReading = newState;
                if (this._eventHandlerForDevice &&
                    this._eventHandlerForDevice.onDeviceIoStatusCallback) {
                    var ioStatus;
                    if (this._isWriting) {
                        if (newState) {
                            ioStatus = DeviceConstants.ioStatus.readwrite;
                        } else {
                            ioStatus = DeviceConstants.ioStatus.write;
                        }
                    } else {
                        if (newState) {
                            ioStatus = DeviceConstants.ioStatus.read;
                        } else {
                            ioStatus = DeviceConstants.ioStatus.none;
                        }
                    }
                    this._eventHandlerForDevice.onDeviceIoStatusCallback(ioStatus);
                }
            }
        },
        isWriting: {
            get: function() {
                return this._isWriting;
            },
            set: function(newState) {
                this._isWriting = newState;
                if (this._eventHandlerForDevice &&
                    this._eventHandlerForDevice.onDeviceIoStatusCallback) {
                    var ioStatus;
                    if (this._isReading) {
                        if (newState) {
                            ioStatus = DeviceConstants.ioStatus.readwrite;
                        } else {
                            ioStatus = DeviceConstants.ioStatus.read;
                        }
                    } else {
                        if (newState) {
                            ioStatus = DeviceConstants.ioStatus.write;
                        } else {
                            ioStatus = DeviceConstants.ioStatus.none;
                        }
                    }
                    this._eventHandlerForDevice.onDeviceIoStatusCallback(ioStatus);
                }
            }
        },
        eventHandlerForDevice: {
            get: function() {
                return this._eventHandlerForDevice;
            }
        },
        //  <summary>
        //  It is important to be able to cancel tasks that may take a while to complete. Canceling tasks is the only way to stop any pending IO
        //  operations asynchronously. If the UsbDevice is closed/deleted while there are pending IOs, the destructor will cancel all pending IO
        //  operations.
        //  </summary>
        cancelAllIoTasks: function () {
            if (this.isPerformingIo) {
                WinJS.log && WinJS.log("Canceling...", "sample", "status");
                this.cancelRead();
                this.cancelWrite();
            }
        },

        cancelRead: function () {
            if (this.readingPromise) {
                this.readingPromise.cancel();
                this.readingPromise = null;
            }
        },

        cancelWrite: function () {
            if (this.writingPromise) {
                this.writingPromise.cancel();
                this.writingPromise = null;
            }
        },

        printTotalReadWriteBytes: function () {
            WinJS.log && WinJS.log("Total bytes read: " + this.totalBytesRead + "; Total bytes written: " + this.totalBytesWritten, "sample", "status");
        },
        //  <summary>
        //  Determines if we are reading, writing, or reading and writing.
        //  </summary>
        //  <returns>If we are doing any of the above operations, we return true; false otherwise</returns>
        isPerformingIo: function () {
            return (this.isReading || this.isWriting);
        },

        //  <summary>
        //  Read async function
        //  </summary>
        readAsync: function (bytesToRead, prefixBinary, prefixLengthAdd) {
            this.resultString = "";
            var stream = this.eventHandlerForDevice && this.eventHandlerForDevice.device && this.eventHandlerForDevice.device.inputStream;
            if (stream) {
                var prefixLength = 0;
                if (!bytesToRead) {
                    bytesToRead = 0x8000;
                }
                if (prefixBinary && prefixBinary.length > 0) {
                    prefixLengthAdd = prefixLengthAdd || 0;
                    prefixLength = prefixBinary.length + prefixLengthAdd;
                }
                var that = this;
                var reader = new Windows.Storage.Streams.DataReader(stream);
                //reader.InputStreamOptions = Windows.Storage.Streams.InputStreamOptions.Partial;
                this.readingPromise = reader.loadAsync(bytesToRead).then(function(bytesRead) {
					function readUnknownString(count) {
						var result = "";
						if (count > 0) {
							try {
								result += reader.readString(count);
							} catch (e) {
								var buffer = reader.readBuffer(count);
								var arrByte = Windows.Security.Cryptography.CryptographicBuffer.copyToByteArray(buffer);
								for (var i=0; i<arrByte.length; i++) {
									var c;
									try {
									    c = String.fromCharCode(arrByte[i]);
									} catch(e) {
										c = "?";
									}
								    result += c;
								}
							}
						}
						return result;
					}
                    that.totalBytesRead += bytesRead;
                    that.printTotalReadWriteBytes();
                    if (prefixLength && bytesRead > prefixLength && prefixBinary && prefixBinary.length > 0) {
                        that.resultString += reader.readString(prefixLength);
                        if (that.resultString.substr(0, prefixBinary.length) === prefixBinary) {
                            var buffer = reader.readBuffer(bytesRead - prefixLength);
                            var encoded = Windows.Security.Cryptography.CryptographicBuffer.encodeToBase64String(buffer);
                            that.resultString += encoded;
                        } else {
                            that.resultString += readUnknownString(bytesRead - prefixLength);
                        }
                    } else {
                        that.resultString += readUnknownString(bytesRead);
                    }
                    reader.detachStream();
                    reader.close();
                });
            } else {
                this.readingPromise = null;
            }
            return this.readingPromise;
        },

        //  <summary>
        //  </summary>
        writeAsync: function (data) {
            var stream = this.eventHandlerForDevice && this.eventHandlerForDevice.device && this.eventHandlerForDevice.device.outputStream;
            if (stream) {
                var that = this;
                this.isWriting = true;
                var writer = new Windows.Storage.Streams.DataWriter(stream);
                if (typeof data === "string") {
                    writer.writeString(data);
                } else {
                    writer.writeBytes(data);
                }
                // This is where the data is flushed out to the device.
                this.writingPromise = writer.storeAsync().then(function(bytesWritten) {
                    that.totalBytesWritten += bytesWritten;
                    that.printTotalReadWriteBytes();
                    writer.detachStream();
                    writer.close();
                });
            } else {
                this.writingPromise = null;
            }
            return this.writingPromise;
        },

        //  <summary>
        //  Stop any pending IO operations because the device will be closed when the app suspends
        //  </summary>
        //  <param name="eventArgs"></param>
        _onAppSuspension: function (eventArgs) {
            this.cancelAllIoTasks();
        },
        //  <summary>
        //  Reset the buttons when the device is reopened
        //  </summary>
        //  <param name="onDeviceConnectedEventArgs"></param>
        _onDeviceConnected: function (onDeviceConnectedEventArgs) {

        }

    }); // end of serialIoClass

    var deviceSelector = null;
    var deviceWatcher = null;
    var listOfDevices = [];
    var isAllDevicesEnumerated = false;

    var openDeviceParams = {};

    function findDevice (deviceId) {
        if (deviceId) {
            for (var i = 0, numDeviceEntries = listOfDevices.length; i < numDeviceEntries; i++) {
                if (listOfDevices[i].deviceInformation.id === deviceId) {
                    return listOfDevices[i];
                }
            }
        }
        return null;
    }
    function addDeviceToList(deviceInformation, deviceSelector) {
        // search the device list for a device with a matching interface ID
        var match = findDevice(deviceInformation.id);

        // Create a new entry only if it's not in the list of devices
        if (!match) {
            // Create a new element for this device interface to be used by the UI
            match = new DeviceListEntry(deviceInformation, deviceSelector);

            // Add the new element to the end of the list of devices
            listOfDevices.push(match);
        }
    }
    function removeDeviceFromList (deviceId) {
        // Search the list of devices for one with a matching ID. and remove it from the list
        var deviceEntry = findDevice(deviceId);

        listOfDevices.splice(listOfDevices.indexOf(deviceEntry), 1);
    }
    function clearDeviceEntries () {
        listOfDevices.splice(0, listOfDevices.length);
    }
    function onDeviceAdded(deviceInformation) {
        WinJS.log && WinJS.log(deviceInformation.id + " was added.", "sample", "status");

        addDeviceToList(deviceInformation, deviceSelector);
        if (isAllDevicesEnumerated &&
            openDeviceParams &&
            typeof openDeviceParams.change === "function") {
            var deviceList = [];
            for (var i = 0, numDeviceEntries = listOfDevices.length; i < numDeviceEntries; i++) {
                if (listOfDevices[i].deviceInformation) {
                    deviceList.push({
                        name: listOfDevices[i].deviceInformation.name,
                        id: listOfDevices[i].deviceInformation.id
                    });
                }
            }
            openDeviceParams.change(deviceList);
        }
    }
    function onDeviceRemoved(deviceInformationUpdate) {
        WinJS.log && WinJS.log(deviceInformationUpdate.id + " was removed.", "sample", "status");

        removeDeviceFromList(deviceInformationUpdate.id);
        if (isAllDevicesEnumerated &&
            openDeviceParams &&
            typeof openDeviceParams.change === "function") {
            var deviceList = [];
            for (var i = 0, numDeviceEntries = listOfDevices.length; i < numDeviceEntries; i++) {
                if (listOfDevices[i].deviceInformation) {
                    deviceList.push({
                        name: listOfDevices[i].deviceInformation.name,
                        id: listOfDevices[i].deviceInformation.id
                    });
                }
            }
            openDeviceParams.change(deviceList);
        }
    }
    function onDeviceEnumerationComplete(args) {
        WinJS.log && WinJS.log("onDeviceEnumerationComplete", "sample", "status");

        isAllDevicesEnumerated = true;
        if (openDeviceParams &&
            typeof openDeviceParams.success === "function") {
            var deviceList = [];
            for (var i = 0, numDeviceEntries = listOfDevices.length; i < numDeviceEntries; i++) {
                if (listOfDevices[i].deviceInformation) {
                    deviceList.push({
                        name: listOfDevices[i].deviceInformation.name,
                        id: listOfDevices[i].deviceInformation.id
                    });
                }
            }
            openDeviceParams.success(deviceList);
        }
    }

    function closeDeviceList() {
        if (deviceWatcher) {
            clearDeviceEntries();

            deviceWatcher.stop();

            deviceWatcher.removeEventListener("enumerationcompleted", onDeviceEnumerationComplete);
            deviceWatcher.removeEventListener("removed", onDeviceRemoved);
            deviceWatcher.removeEventListener("added", onDeviceAdded);

            deviceWatcher = null;
            deviceSelector = null;
            isAllDevicesEnumerated = false;
        }
    }

    function openDeviceList(success, fail, args) {
        openDeviceParams = {
            success: success,
            fail: fail,
            change: args && args[0]
        }
        closeDeviceList();
        if (!deviceWatcher) {
            deviceSelector = Windows.Devices.SerialCommunication.SerialDevice.getDeviceSelector();

            // Create a device watcher to look for instances of the Serial device
            // The createWatcher() takes a string only when you provide it two arguments, so be sure to include an array as a second
            // parameter (JavaScript can only recognize overloaded functions with different numbers of parameters).
            deviceWatcher = Windows.Devices.Enumeration.DeviceInformation.createWatcher(deviceSelector, []);

            deviceWatcher.addEventListener("added", onDeviceAdded, false);
            deviceWatcher.addEventListener("removed", onDeviceRemoved, false);
            deviceWatcher.addEventListener("enumerationcompleted", onDeviceEnumerationComplete, false);

            deviceWatcher.start();
        }
    }

    function enumConnectionStatus(success) {
        success(DeviceConstants.connectionStatus);
    }
    function enumIoStatus(success) {
        success(DeviceConstants.ioStatus);
    }

    function connectDevice(success, fail, args) {
        var id = args && args[0];
        var onDeviceConnectionStatusChange = args && args[1];
        WinJS.log && WinJS.log("Connecting to: " + id, "sample", "status");

        if (!deviceConnections[id]) {
            deviceConnections[id] = {
                connectionStatus: DeviceConstants.connectionStatus.none,
                ioStatus: DeviceConstants.ioStatus.none
            }
        } else if (deviceConnections[id].connectionStatus === DeviceConstants.connectionStatus.connecting) {
            fail({
                id: id,
                connectionStatus: deviceConnections[id].connectionStatus,
                ioStatus: deviceConnections[id].ioStatus
            });
            return;
        }
        var deviceConnection = deviceConnections[id];
        if (deviceConnection.connectionStatus === DeviceConstants.connectionStatus.connected) {
            success({
                id: id,
                connectionStatus: deviceConnection.connectionStatus,
                ioStatus: deviceConnection.ioStatus
            });
            return;
        }

        if (!deviceWatcher) {
            openDeviceList();
        }
        if (!isAllDevicesEnumerated) {
            WinJS.Promise.timeout(250).then(function () {
                connectDevice(success, fail, args);
            });
            return;
        }
        var entry = findDevice(id);
        if (!entry) {
            fail({
                id: id,
                connectionStatus: DeviceConstants.connectionStatus.unknown,
                ioStatus: DeviceConstants.ioStatus.none
            });
            return;
        }
        if (!deviceConnection.eventHandler) {
            deviceConnection.eventHandler = new EventHandlerForDeviceClass(false);
        }
        deviceConnection.eventHandler.onDeviceConnectionStatusCallback = function (newStatus) {
            if (newStatus) {
                deviceConnection.connectionStatus = newStatus;
            }
            WinJS.log && WinJS.log("Status of: " + id + " changed to " + deviceConnection.connectionStatus, "sample", "status");
            if (typeof onDeviceConnectionStatusChange === "function") {
                onDeviceConnectionStatusChange({
                    id: id,
                    connectionStatus: deviceConnection.connectionStatus,
                    ioStatus: deviceConnection.ioStatus
                });
            }
        };
        deviceConnection.eventHandler.onDeviceIoStatusCallback = function (newStatus) {
            if (newStatus) {
                deviceConnection.ioStatus = newStatus;
            }
            WinJS.log && WinJS.log("Status of: " + id + " changed to " + deviceConnection.ioStatus, "sample", "status");
            if (typeof onDeviceConnectionStatusChange === "function") {
                onDeviceConnectionStatusChange({
                    id: id,
                    connectionStatus: deviceConnection.connectionStatus,
                    ioStatus: deviceConnection.ioStatus
                });
            }
        };
        deviceConnection.eventHandler.onDeviceConnectedCallback = function (onDeviceConnectedEventArgs) {
            // Find and select our connected device
            if (onDeviceConnectedEventArgs && onDeviceConnectedEventArgs.isDeviceSuccessfullyConnected) {
                WinJS.log && WinJS.log("Currently connected to: " + id, "sample", "status");
                success({
                    id: id,
                    connectionStatus: deviceConnection.connectionStatus,
                    ioStatus: deviceConnection.ioStatus
                });
            } else {
                // Error occurred. EventHandlerForDevice will automatically prevent future automatic reconnections
                WinJS.log && WinJS.log("ERROR connected to: " + id, "sample", "error");
                fail({
                    id: id,
                    connectionStatus: deviceConnection.connectionStatus,
                    ioStatus: deviceConnection.ioStatus
                });
            }
        };
        deviceConnection.eventHandler.onDeviceCloseCallback = function (deviceInformation) {
            // We were connected to the device that was unplugged
            WinJS.log && WinJS.log("Closed connection to: " + id, "sample", "status");
            if (typeof deviceConnection.closeCallback === "function") {
                deviceConnection.closeCallback();
            }
        };
        deviceConnection.connectionStatus = DeviceConstants.connectionStatus.connecting;
        if (typeof onDeviceConnectionStatusChange === "function") {
            onDeviceConnectionStatusChange({
                id: id,
                connectionStatus: deviceConnection.connectionStatus,
                ioStatus: deviceConnection.ioStatus
            });
        }
        deviceConnection.eventHandler.openDeviceAsync(entry.deviceInformation, entry.deviceSelector);
    }

    function disconnectDevice(success, fail, args) {
        var id = args && args[0];
        var onDeviceConnectionStatusChange = args && args[1];
        WinJS.log && WinJS.log("Disconnecting from: " + id, "sample", "status");

        var deviceConnection = deviceConnections[id];
        if (!deviceConnection) {
            fail({
                id: id,
                connectionStatus: DeviceConstants.connectionStatus.unknown,
                ioStatus: DeviceConstants.ioStatus.none
            });
            return;
        }
        if (deviceConnection.connectionStatus === DeviceConstants.connectionStatus.disconnecting) {
            fail({
                id: id,
                connectionStatus: deviceConnection.connectionStatus,
                ioStatus: deviceConnection.ioStatus
            });
            return;
        }
        if (deviceConnection.connectionStatus === DeviceConstants.connectionStatus.disconnected) {
            success({
                id: id,
                connectionStatus: deviceConnection.connectionStatus,
                ioStatus: deviceConnection.ioStatus
            });
            return;
        }
        if (!deviceConnection.eventHandler) {
            fail({
                id: id,
                connectionStatus: deviceConnection.connectionStatus,
                ioStatus: deviceConnection.ioStatus
            });
            return;
        }
        deviceConnection.eventHandler.onDeviceConnectionStatusCallback = function (newStatus) {
            if (newStatus) {
                deviceConnection.connectionStatus = newStatus;
            }
            WinJS.log && WinJS.log("Status of: " + id + " changed to " + deviceConnection.connectionStatus, "sample", "status");
            if (typeof onDeviceConnectionStatusChange === "function") {
                onDeviceConnectionStatusChange({
                    id: id,
                    connectionStatus: deviceConnection.connectionStatus,
                    ioStatus: deviceConnection.ioStatus
                });
            }
        };
        deviceConnection.eventHandler.onDeviceIoStatusCallback = function (newStatus) {
            if (newStatus) {
                deviceConnection.ioStatus = newStatus;
            }
            WinJS.log && WinJS.log("Status of: " + id + " changed to " + deviceConnection.ioStatus, "sample", "status");
            if (typeof onDeviceConnectionStatusChange === "function") {
                onDeviceConnectionStatusChange({
                    id: id,
                    connectionStatus: deviceConnection.connectionStatus,
                    ioStatus: deviceConnection.ioStatus
                });
            }
        };
        deviceConnection.closeCallback = function() {
            success({
                id: id,
                connectionStatus: deviceConnection.connectionStatus,
                ioStatus: deviceConnection.ioStatus
            });
        }

        if (deviceConnection.serialIo) {
            deviceConnection.serialIo.cancelAllIoTasks();
            //deviceConnection.serialIo.dispose();
            //deviceConnection.serialIo = null;
        }
        deviceConnection.eventHandler.isEnabledAutoReconnect = false;
        WinJS.Promise.timeout(250).then(function() {
            deviceConnection.eventHandler.closeDevice();
        });
    }

    function readFromDevice(success, fail, args) {
        var id = args && args[0];
        var onDeviceConnectionStatusChange = args && args[1];
        var prefixBinary = args && args[2];
        var prefixLengthAdd = args && args[3];

        WinJS.log && WinJS.log("Reading from: " + id, "sample", "status");

        var deviceConnection = deviceConnections[id];
        if (!deviceConnection) {
            fail({
                id: id,
                connectionStatus: DeviceConstants.connectionStatus.unknown,
                ioStatus: DeviceConstants.ioStatus.none
            });
            return;
        }
        if (deviceConnection.ioStatus === DeviceConstants.connectionStatus.read ||
            deviceConnection.ioStatus === DeviceConstants.connectionStatus.readwrite) {
            fail({
                id: id,
                connectionStatus: deviceConnection.connectionStatus,
                ioStatus: deviceConnection.ioStatus
            });
            return;
        }
        if (deviceConnection.connectionStatus !== DeviceConstants.connectionStatus.connected) {
            fail({
                id: id,
                connectionStatus: deviceConnection.connectionStatus,
                ioStatus: deviceConnection.ioStatus
            });
            return;
        }
        if (!deviceConnection.eventHandler) {
            fail({
                id: id,
                connectionStatus: deviceConnection.connectionStatus,
                ioStatus: deviceConnection.ioStatus
            });
            return;
        }
        deviceConnection.eventHandler.onDeviceConnectionStatusCallback = function (newStatus) {
            if (newStatus) {
                deviceConnection.connectionStatus = newStatus;
            }
            WinJS.log && WinJS.log("Status of: " + id + " changed to " + deviceConnection.connectionStatus, "sample", "status");
            if (typeof onDeviceConnectionStatusChange === "function") {
                onDeviceConnectionStatusChange({
                    id: id,
                    connectionStatus: deviceConnection.connectionStatus,
                    ioStatus: deviceConnection.ioStatus
                });
            }
        };
        deviceConnection.eventHandler.onDeviceIoStatusCallback = function (newStatus) {
            if (newStatus) {
                deviceConnection.ioStatus = newStatus;
            }
            WinJS.log && WinJS.log("Status of: " + id + " changed to " + deviceConnection.ioStatus, "sample", "status");
            if (typeof onDeviceConnectionStatusChange === "function") {
                onDeviceConnectionStatusChange({
                    id: id,
                    connectionStatus: deviceConnection.connectionStatus,
                    ioStatus: deviceConnection.ioStatus
                });
            }
        };
        if (!deviceConnection.serialIo) {
            deviceConnection.serialIo = new SerialIoClass(deviceConnection.eventHandler);
        } else if (deviceConnection.serialIo.isReading) {
            // should not happen, status already checked...
            fail({
                id: id,
                connectionStatus: deviceConnection.connectionStatus,
                ioStatus: deviceConnection.ioStatus
            });
        }
        if (deviceConnection.eventHandler.device &&
            !deviceConnection.eventHandler.device.readTimeout) {
            deviceConnection.eventHandler.device.readTimeout = 120;
        }
        var dataReaderLoadOperation = null;
        var resultString = "";
        function readAsync() {
            if (deviceConnection.serialIo) {
                deviceConnection.serialIo.isReading = true;
                dataReaderLoadOperation = deviceConnection.serialIo.readAsync(null, prefixBinary, prefixLengthAdd);
                if (dataReaderLoadOperation) {
                    dataReaderLoadOperation.done(function() {
                        if (deviceConnection.serialIo && deviceConnection.serialIo.readingPromise) {
                            dataReaderLoadOperation = deviceConnection.serialIo.readingPromise;
                            resultString += deviceConnection.serialIo.resultString;
                            if (typeof dataReaderLoadOperation.status === "undefined" ||
                                dataReaderLoadOperation.status === Windows.Foundation.AsyncStatus.completed) {
                                deviceConnection.serialIo.isReading = false;
                                success({
                                    id: id,
                                    connectionStatus: deviceConnection.connectionStatus,
                                    ioStatus: deviceConnection.ioStatus,
                                    data: resultString
                                });
                            } else {
                                WinJS.Promise.timeout(0).then(function() {
                                    readAsync();
                                });
                            }
                        } else {
                            if (deviceConnection.serialIo) {
                                deviceConnection.serialIo.isReading = false;
                            }
                            fail({
                                id: id,
                                connectionStatus: deviceConnection.connectionStatus,
                                ioStatus: deviceConnection.ioStatus
                            });
                        }
                    }, function(error) {
                        if (deviceConnection.serialIo) {
                            deviceConnection.serialIo.isReading = false;
                        }
                        // Promise was canceled
                        if (error.name === "Canceled") {
                            WinJS.log && WinJS.log("Read Canceled...", "sample", "status");
                        } else {
							error.id = id;
							error.connectionStatus = deviceConnection.connectionStatus;
							error.ioStatus = deviceConnection.ioStatus;
                            fail(error);
                        }
                    });
                } else {
                    if (deviceConnection.serialIo) {
                        deviceConnection.serialIo.isReading = false;
                    }
                    fail({
                        id: id,
                        connectionStatus: deviceConnection.connectionStatus,
                        ioStatus: deviceConnection.ioStatus
                    });
                }
            } else {
                fail({
                    id: id,
                    connectionStatus: deviceConnection.connectionStatus,
                    ioStatus: deviceConnection.ioStatus
                });
            }
        }
        readAsync();
    }

    module.exports = {
        openDeviceList: openDeviceList,
        closeDeviceList: closeDeviceList,
        enumConnectionStatus: enumConnectionStatus,
        enumIoStatus: enumIoStatus,
        connectDevice: connectDevice,
        disconnectDevice: disconnectDevice,
        readFromDevice: readFromDevice
    };

    require("cordova/exec/proxy").add("SerialDevice", module.exports);

