'use strict';

var util = require('util');
var stream = require('stream');

var async = require('async');
var noble = require('noble');
var FlowerPower = require('flower-power');

function Driver(opts, app) {
  this.opts = opts;
  this.app = app;

  this.bridges = {};

  app.once('client::up', function() {
    this.log.debug('Starting up');

    this.start();
  }.bind(this));

}
util.inherits(Driver, stream);

Driver.prototype.start = function() {

  this.log.info('Starting up');

  var self = this;
  var log = this.log;

  var devices = {};
  var busy = {};

  noble.on('discover', function(peripheral) {
    if (busy[peripheral.uuid]) {
//      log.debug('Ignoring', peripheral.uuid);
      return;
    }

    log.info('Connecting to', peripheral.uuid);

    busy[peripheral.uuid] = true;
    setTimeout(function() {
      busy[peripheral.uuid] = false;
    }, 60000); // The amount of time to wait before we care about this devices data again

    var device = new FlowerPower(peripheral);

    device.connect(function() {
      log.info('Connected to', device.uuid);
      device.discoverServicesAndCharacteristics(function(x) {
        log.info('Got characteristics', x);
        device.readSerialNumber(function(serialNumber) {
          log.info('Connected to device', device.uuid, 'with serial number :', serialNumber);

          if (!devices[device.uuid]) {
            devices[device.uuid] = [
              new Device(log, device.uuid, 'Flower Power Temp ' + device.uuid, 9, 'readTemperature'),
              new Device(log, device.uuid, 'Flower Power Sun ' + device.uuid, 2000, 'readSunlight'),
              new Device(log, device.uuid, 'Flower Power Moisture ' + device.uuid, 8, 'readSoilMoisture')
            ].map(function(d) {
              self.emit('register', d);
              return d;
            });
          }

          process.nextTick(function() {
            async.series(devices[device.uuid].map(function(d) {
              console.log('checking device', d);
              return d.update.bind(d, device);
            }), function() {
              log.info('Finished updating', device.uuid);
              device.disconnect(function() {
                log.info('Disconnected from', device.uuid);
              });
            });
          });

        });
      });

    });
  });

  var startScanningOnPowerOn = function() {
    if (noble.state === 'poweredOn') {
      noble.startScanning(['39e1fa0084a811e2afba0002a5d5c51b'], true);
    } else {
      noble.once('stateChange', startScanningOnPowerOn);
    }
  };

  startScanningOnPowerOn();
};

function Device(log, serial, name, deviceId, method) {
  this.readable = true;
  this.writeable = false;
  this.V = 0;
  this.D = deviceId;
  this.name = name;
  this.G = 'flowerpower'+serial;
  this.log = log;
  this.method = method;
}
util.inherits(Device, stream);

Device.prototype.update = function(fp, cb) {
  var self = this;
  var log = this.log;
  var send = this.emit.bind(this, 'data');

  fp[this.method](function(sunlight) {
    log.debug(self.G, 'Got', sunlight);
    send(sunlight);
    cb();
  });

};

module.exports = Driver;
