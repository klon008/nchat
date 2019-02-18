var port = 3000; // Указываем порт на котором у на стоит сокет
var socket = io.connect('/');
var $ = jQuery;
var intervalTyping = 7000;
var myName = '';
var usersTyping = [];
var currCliTyping = false;
var cliTypingTimeout;
var allusers = [];
socket.on('disconnect', function(){
  location.reload();
});
socket.on('loadHistory', function(data){
  data.forEach(function(item){
    var msgObjParsed = JSON.parse(item);
    var date = new Date(msgObjParsed.t);
    addUsersMessageToChat(date,msgObjParsed.n,msgObjParsed.m)
  });
});
socket.on('userGetName', function(data){
  var userName = myName = data.myname;
  allusers = data.users;
  addSysMessageToChat('Вам присвоено Имя - ' + userName);
  var buttonLogoutText = "<a href=\"/logout\" class=\"btn btn_logout\" onclick='logout();'><img src='/img/Logout-512.png' alt='logout'></a>";
   $('#users_list').append('<div class="user my_user" data-username="'+userName+'"><img src="img/user-ava.png"><div class="info"><div class="user_name">'+userName+'</div><div class="status"></div></div>'+buttonLogoutText+'</div>');
   for (var i=0; i<allusers.length; i++){
      $('#users_list').append('<div class="user" data-username="'+allusers[i]+'"><img src="img/user-ava.png"><div class="info"><div class="user_name">'+allusers[i]+'</div><div class="status"></div></div></div>');
   }
});
socket.on('sysMsg', function(data){
  addSysMessageToChat(data);
});

socket.on('sysMsgRenameMe', function(data){
  addSysMessageToChat("Имя изменено на " + data);
  renameUser(myName,data);
  myName = data;
});
socket.on('errorAndGoToLogin', function(e){
  alert(e);
  socket.disconnect();
  window.location.href = "/logout";
});
socket.on('sysMsgUserRename', function(data){
  var oldName =  data.oldName;
  var newName = data.newName;
  addSysMessageToChat("Пользователь "+oldName+" изменил имя на "+newName);
  renameUser(oldName,newName);
});

function renameUser(oldName, newName){
  var index = allusers.indexOf(oldName);

  if (~index) {
    allusers[index] = newName;
  }
  $('.user[data-username="'+oldName+'"]').attr('data-username', newName).find('.user_name').text(newName);
}

socket.on('newUser', function(userName){
  addSysMessageToChat(userName + ' Присоединился!');
  $('#users_list').append('<div class="user" data-username="'+userName+'"><img src="img/user-ava.png"><div class="info"><div class="user_name">'+userName+'</div><div class="status"></div></div></div>');
});

$(document).on('click', 'button', function(){ // Прослушка кнопки на клик
  var message = $('input').val(); // Все что в поле для ввода записываем в переменную
  socket.emit('message', message); // Отправляем событие 'message' на сервер c самим текстом (message)- как переменная
  $('input').val(null); // Заполняем поле для ввода 'пустотой'
});

socket.on('messageToClients', function(msg, name){
  removeTypingName(name);
  var date = new Date();
  addUsersMessageToChat(date,name,msg);
});

socket.on('userLeaveName', function(userName){
  removeTypingName(userName);
  addSysMessageToChat(userName + ' покинул чат.');
  $('#users_list').find('div.user[data-username="'+userName+'"]').remove();
  var idx = allusers.indexOf(userName);
    if (idx != -1) {
      allusers.splice(idx, 1);
    }
});

$(function() {
  $(".do-nicescrol").niceScroll();
  $('#text_for_sending').keypress(function(e){
    if (e.keyCode === 13) {
        $("#btn_send").click();
    }
    if (!currCliTyping){
      socket.emit('typing', 500);
      clearTimeout(cliTypingTimeout);
      cliTypingTimeout = setTimeout(currCliTypingTimeoutFunction, intervalTyping);
      currCliTyping = true;
    } else {

    }

  });
  $("#type_indicator").hide();
});

function currCliTypingTimeoutFunction(){
  currCliTyping = false;
}



socket.on('typing', function(data){

  doWriteIndicator(data);

});

function doWriteIndicator(dd){
  if (usersTyping.indexOf(dd) == -1){

    usersTyping.push(dd);
    $("#type_indicator").show();

  } else{

    clearTimeout(cliTypingTimeout);
    cliTypingTimeout = setTimeout(currCliTypingTimeoutFunction, intervalTyping);

  }
  $('#typing_names').text( usersTyping.join(' ,') );
  if(usersTyping.length == 1) {
    $('#typing_numbers').text(' Печатает сообщение');
  } else if (usersTyping.length > 1) {
    $('#typing_numbers').text(' Печатают сообщение');
  }
  setTimeout(removeTypingName, intervalTyping+100, dd);

};

function removeTypingName(dd){
  if (usersTyping.indexOf(dd) >= 0){

    usersTyping.splice(usersTyping.indexOf(dd), 1);

    if(usersTyping.length == 1) {
      $('#typing_numbers').text(' Печатает сообщение');
    } else if (usersTyping.length > 1) {
      $('#typing_numbers').text(' Печатают сообщение');
    } else {
      $("#type_indicator").hide();
    }
  }
}

function addSysMessageToChat(msg){
  $('#chat_box').append('<div class="sys_message"><span>'+ msg+'</div>');
  var objDiv = document.getElementById("chat_box");
  objDiv.scrollTop = objDiv.scrollHeight;
}

function addUsersMessageToChat(date, user, msg){
  var hours = date.getHours();
  var minutes = date.getMinutes();
  var seconds = date.getSeconds();
  if (myName!==user){
    $('#chat_box').append('<div><div class="msg_wrap"><span class="name">' + user +
     '</span><span class="message">'+ msg +'</span></div><span class="time">'+ hours+':'+minutes+':'+seconds + '</span></div>');
  } else {
    $('#chat_box').append('<div class="myownmessage"><div class="msg_wrap"><span class="name"><b>'+user+'</b></span><span class="message">'+ msg +'</span></div><div class="time">'+ hours+':'+minutes+':'+seconds + '</div></div>');
  }
  var objDiv = document.getElementById("chat_box");
  objDiv.scrollTop = objDiv.scrollHeight;
}

