'use strict';

var os = require('os');

function getHostIPv4() {
    var ifaces = os.networkInterfaces();
    for (var iface in ifaces) {
        for (var ifaceAdress in ifaces[iface]) {
            var ifaceInfo = ifaces[iface][ifaceAdress];
            if (ifaceInfo.family === 'IPv4' && ifaceInfo.internal !== true) return ifaceInfo.address;
        }
    }
    return '';
}

var dgram = require('dgram')
    , fs = require('fs')
    , ssdpAddress = '239.255.255.250'
    , ssdpPort = 1900
    , sourceIface = getHostIPv4()
    , sourcePort = 0                 // chosen at random
    , searchTarget = "urn:schemas-upnp-org:service:3dpPuBackend:1"
    , socket
    ;

function broadcastSsdp() {
    var query = new Buffer(
        'M-SEARCH * HTTP/1.1\r\n'
        + 'HOST: ' + ssdpAddress + ':' + ssdpPort + '\r\n'
        + 'MAN: "ssdp:discover"\r\n'
        + 'MX: 1\r\n'
        + 'ST: ' + searchTarget + '\r\n'
        + '\r\n'
    );

    // Send query on each socket
    socket.send(query, 0, query.length, ssdpPort, ssdpAddress);
}

function getBackendUrl(cb) {
    var mySet = new Set();

    socket = dgram.createSocket('udp4');

    socket.on('listening', function () {
        console.log('socket ready...');

        broadcastSsdp();
    });

    socket.on('message', function (chunk, info) {
        var message = chunk.toString();
        // console.log('[incoming] UDP message');
        // console.log(info);
        // console.log(message);

        console.log(message);
        var backendUrl = message.match(/LOCATION: (.+)/)[1];
        mySet.add(backendUrl);
    });

    console.log('binding to', sourceIface + ':' + sourcePort);
    socket.bind(sourcePort, sourceIface);

    setTimeout(function () {
        console.log("Finished waiting");
        socket.close();

        cb(mySet);
    }, 1000);

}

module.exports.getBackendUrl = getBackendUrl;
