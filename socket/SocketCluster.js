const EventEmitter = require('events').EventEmitter;
const cookie = require('cookie');
const io = require('socket.io');
const Redis = require('ioredis');
const redisAdapter = require('socket.io-redis');
const config = require('./../config/index');

const log4js = require('./../config/Logger');
const console = log4js.getLogger('SocketCluster');


const NameSpace = {DEFAULT: '/'};
module.exports = SocketCluster;

var socketServer = null;
var redisClient = null;
/**
 * @param server  HTTPServer
 * @param path instance
 * @constructor
 */
function SocketCluster(server, path) {
  var that = this;
  redisClient = new Redis(config.redis);
  socketServer = io().listen(server, {
    path: path,
    transports: ['websocket'],
    cookie:true
  });

  socketServer.adapter(redisAdapter(config.redis));
  //cookie
  socketServer.use((socket, next) => {
    var socketCookie = socket.handshake.headers.cookie || socket.request.headers.cookie;
    console.log('socket cookie', socket.id, socketCookie);
    if (socketCookie){ //自动登录
      socket.cookies = cookie.parse(socketCookie);
      //查询数据
      redisClient.get('SESSION:' + socket.cookies.io, function(err, data){
        if (err) {
          console.warn('session Error', err);
        } else {
          var json = JSON.parse(data);
          if (data && json) {
            socket.td = json.td;
            socket.joinInfo = json.info;
          }
        }
        return next();
      });
    } else {
      socket.request.headers.cookie['io'] = socket.id;
      console.log(JSON.stringify(socket.request.headers));
      // socket.request.headers.cookie['io'] = socket.id;
      next();
    }
  });

  socketServer.use((socket, next) => {
    socket.address = (socket.handshake.headers['x-forwarded-for'] ||
                      socket.request.connection.remoteAddress ||
                      socket.handshake.address).replace("::ffff:", "");
    socket.ua = socket.handshake.headers['user-agent'];
    socket.query = socket.handshake.query;
    next();
  });

  socketServer.on('connection', function (socket) {
    console.log("TD new socket", socket.id, socket.address, JSON.stringify(socket.query));
    socket.on('disconnect', function (info) {
      that.onDisconnect(socket, info);
    });
    that.onConnection(socket);
  });

  // socketServer.of(NameSpace.DEFAULT).adapter.remoteJoin('socket id', 'room id', function (err) {
  // 让socket给定的id加入房间。回调将在socket加入到房间后触发，否则如果没有找到socket客户端，会提供一个err 参数
  // });

  // socketServer.of(NameSpace.DEFAULT).adapter.remoteLeave('socket id', 'room id', function (err) {
  // 使给定socketid的客户端离开房间。回调将在客户端离开房间后触发，如果没找到socket客户端，则会返回一个arr参数.
  // });
}

/**
 * 把socket存储管理器
 * @param socket
 */
SocketCluster.prototype.onConnection = function (socket) {
  var that = this;
  //自动登录
  if(socket.joinInfo && socket.td){
    console.log(socket.td,'auto login', socket.id, socket.joinInfo);
    that.roomManagement(socket);
  }

  //用户加入区域
  socket.on('join', function (name, region) {
    socket.td = region.id;
    socket.joinInfo = {
      uuid: socket.id,
      pid: process.pid,
      id: region.id,
      name: region.label,
      userName: name
    };

    // redisClient.set('SESSION:' + socket.cookies.io, JSON.stringify({td:socket.td, info:socket.joinInfo}));
    console.info(socket.td, socket.joinInfo);
    that.roomManagement(socket);
  });

  socket.on('chat', function (text, id) {
    if (id) {
      socket.to(id).emit('chat', {user:socket.joinInfo, text:text});
    } else {
      socket.to(socket.td).emit('chat', {user:socket.joinInfo, text:text});
    }
  });

  socket.on('share', function (data) {
    socketServer.to(socket.td).emit('share', data);
  });
};

//房间管理
SocketCluster.prototype.roomManagement = function (socket) {
  var that = this;
  that.roomListen();
  socket.emit('connected', socket.joinInfo);
  that.getClient(socket.td).then(function (clients) {
    return that.roomMember(socket.td, clients);
  }).then(function (members) {
    console.log(socket.td, '已经在线的用户', JSON.stringify(members));
    socket.join(socket.td);
    socket.emit('success', members);
    //发给所有人, 包含自己
    socketServer.to(socket.td).emit('userEntry', socket.joinInfo);
  });
};

SocketCluster.prototype.getClient = function (td) {
  return new Promise(function (resolve, reject) {
    socketServer.in(td).clients(function (err, clients) {
      console.log(td, 'Client list', clients, err);
      resolve(clients);
    });
  });
};

SocketCluster.prototype.roomMember = function (td, clients) {
  var data = {event: 'member', clients: clients, td:td};
  return new Promise(function (resolve, reject) {
    socketServer.of(NameSpace.DEFAULT).adapter.customRequest(data, function (err, replies) {
      console.log(td, clients, 'replies', replies.length, replies, err);
      if (err) {
        resolve(null);
      }
      if(replies && replies.length){
        var list = [];
        replies.forEach(function (item) {
           if(item && item.length){
             list = list.concat(item);
           }
        });
        resolve(list);
      }else{
        resolve(null);
      }
    });
  });
};

/**
 * 节点房间监听
 */
SocketCluster.prototype.roomListen = function () {
  socketServer.of(NameSpace.DEFAULT).adapter.customHook = function (data, callback) {
    switch (data && data.event) {
      case 'member':
        var list = [];
        data.clients = data.clients || [];
        data.clients.forEach(function (socketId) {
          const socket = socketServer.of(NameSpace.DEFAULT).connected[socketId];
          if (socket) {
            socket.joinInfo.pid = process.pid;
            list.push(socket.joinInfo);
          }
        });

        console.log(data.td, data.clients, '查询结果', JSON.stringify(list));
        callback && callback(list);
        break;
    }
    callback && callback([]);
  }
};

/**
 * 使给定id的socket客户端断开连接M. 如果将 close 设置为true, 它也将关闭其底层等socket。
 * 回调将会在socket客户端断开连接后调用，如果socket客户端没找到，则会返回一个 err 参数。
 */
SocketCluster.prototype.remoteDisconnect = function (socketId) {
  var that = this;
  return new Promise((resolve, reject) => {
    socketServer.of(NameSpace.DEFAULT).adapter.remoteDisconnect(socketId, true, function(){
      resolve(true);
    });
  });
};

//socket断开的处理
SocketCluster.prototype.onDisconnect = function (socket, info) {
  socketServer.to(socket.td).emit('userLeave', socket.joinInfo);
};

const util = require('util');
util.inherits(SocketCluster, EventEmitter);
