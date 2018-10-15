
    var argscheck = require('cordova/argscheck'),
        exec = require("cordova/exec");

	function toInt(value) {
		if (typeof value === "string") {
			return parseInt(value);
		}
		return value;
    }

    function noop() {}

    var serialDevice = {
    /**
     * openDeviceList: Starts serial device watcher.
     *
     * Returns an array of serial devices currently available.
     * @typedef module:serialDevice.openDeviceList.success
     * @type {Object}
     * @property {string} [name] - name of device
     * @property {string} [id] - id of device
     *
     * Optional parameters to customize the serial device settings.
     * @typedef module:serialDevice.DeviceListOptions
     * @type {Object}
     * @property {function} [onDeviceListChange] - called on device list change
     */
        openDeviceList: function (success, failure, options) {
            argscheck.checkArgs('fFO', 'SerialDevice.openDeviceList', arguments);
            options = options || {};

            var onDeviceListChange = null;
            if (typeof options.onDeviceListChange === "function") {
                onDeviceListChange = options.onDeviceListChange;
            }
            var args = [onDeviceListChange];

            exec(success, failure, "SerialDevice", "openDeviceList", args);
        },
        /**
         * closeDeviceList: Stops serial device watcher.
         *
         */
        closeDeviceList: function () {
            exec(noop, noop, "SerialDevice", "closeDeviceList");
        },

        enumConnectionStatus: function (success) {
            argscheck.checkArgs('f', 'SerialDevice.enumConnectionStatus', arguments);
            exec(success, noop, "SerialDevice", "enumConnectionStatus");
        },

        enumIoStatus: function (success) {
            argscheck.checkArgs('f', 'SerialDevice.enumIoStatus', arguments);
            exec(success, noop, "SerialDevice", "enumIoStatus");
        },

        /**
         * connectDevice: connects to a device.
         *
         * Optional parameters to customize the serial device settings.
         * @typedef module:serialDevice.ConnectDeviceOptions
         * @type {Object}
         * @property {string} [id] - id of device to connect
         */
        connectDevice: function (success, failure, options) {
            argscheck.checkArgs('fFO', 'SerialDevice.connectDevice', arguments);
            options = options || {};

            var id = options.id;
            var onDeviceConnectionStatusChange = options.onDeviceConnectionStatusChange;
            var args = [id, onDeviceConnectionStatusChange];

            exec(success, failure, "SerialDevice", "connectDevice", args);
        },

        /**
         * disconnectDevice: disconnects from a device.
         *
         * Optional parameters to customize the serial device settings.
         * @typedef module:serialDevice.ConnectDeviceOptions
         * @type {Object}
         * @property {string} [id] - id of device to disconnect
         */
         disconnectDevice: function(success, failure, options) {
            argscheck.checkArgs('fFO', 'SerialDevice.disconnectDevice', arguments);
            options = options || {};

            var id = options.id;
            var onDeviceConnectionStatusChange = options.onDeviceConnectionStatusChange;
            var args = [id, onDeviceConnectionStatusChange];

            exec(success, failure, "SerialDevice", "disconnectDevice", args);
        },

        /**
         * readFromDevice: read data from a device.
         *
         * Optional parameters to customize the serial device settings.
         * @typedef module:serialDevice.ConnectDeviceOptions
         * @type {Object}
         * @property {string} [id] - id of device to connect
         */
        readFromDevice: function (success, failure, options) {
            argscheck.checkArgs('fFO', 'SerialDevice.connectDevice', arguments);
            options = options || {};

            var id = options.id;
            var onDeviceConnectionStatusChange = options.onDeviceConnectionStatusChange;
            var prefixBinary = options.prefixBinary;
            var prefixLengthAdd = options.prefixLengthAdd;
            var args = [id, onDeviceConnectionStatusChange, prefixBinary, prefixLengthAdd];

            exec(success, failure, "SerialDevice", "readFromDevice", args);
        }
    };
    module.exports = serialDevice;



