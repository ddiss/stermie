/*
 * Copyright (c) 2017 Fabrice Bellard
 * Copyright (c) 2022 SUSE LLC
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL
 * THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */
"use strict";

var term, sock_state;

function term_handler(str)
{
    if (sock_state === null) {
        console.log("attempt to send data while disconnected");
    } else {
        sock_state.encode_send(str);
    }
}

function get_params()
{
    var url, query_str, p, tab, i, params, tab2;
    query_str = window.location.href;
    p = query_str.indexOf("?");
    if (p < 0)
        return {};
    query_str = query_str.substr(p + 1);
    tab = query_str.split("&");
    params = {};
    for(i = 0; i < tab.length; i++) {
        tab2 = tab[i].split("=");
        params[decodeURIComponent(tab2[0])] = decodeURIComponent(tab2[1]);
    }
    return params;
}

function Sock(url)
{
    try {
        this.socket = new WebSocket(url);
    } catch(err) {
        this.socket = null;
        term.write('\x1b[0;91m');	/* red high intensity */
        term.writeln(url + ' - websocket error');
        term.write('\x1b[0m');
        return;
    }
    this.socket.binaryType = 'arraybuffer';
    this.socket.onmessage = this.messageHandler.bind(this);
    this.socket.onclose = this.closeHandler.bind(this);
    this.socket.onopen = this.openHandler.bind(this);
    this.socket.onerror = this.errorHandler.bind(this);

    this.msg_queue = "";
    this.encoder = new TextEncoder();
}

Sock.prototype.destroy = function()
{
    this.encoder = null;
    if (this.socket !== null) {
        this.socket.close();
    }
}

Sock.prototype.openHandler = function(e)
{
    this.msg_queue = "";

    var el = document.getElementById("net_progress");
    el.style.visibility = "hidden";

    term.write('\x1b[0;32m');	/* green fg */
    term.writeln(e.target.url + ' - websocket open');
    term.write('\x1b[0m');
}

Sock.prototype.closeHandler = function(e)
{
    var el = document.getElementById("net_progress");
    el.style.visibility = "hidden";

    term.write('\x1b[0;31m');	/* red fg */
    term.writeln(e.target.url + ' - websocket closed');
    term.write('\x1b[0m');
}

Sock.prototype.errorHandler = function(e)
{
    term.write('\x1b[0;91m');	/* red high intensity */
    term.writeln(e.target.url + ' - websocket error');
    term.write('\x1b[0m');
}

Sock.prototype.messageHandler = function(e)
{
    var str, buf, i;
    if (e.data instanceof ArrayBuffer) {
        buf = new Uint8Array(e.data);
        for (i = 0; i < e.data.byteLength; i++) {
            this.msg_queue += String.fromCharCode(buf[i]);
        }
	if (this.msg_queue)
            setTimeout(this.msg_drain.bind(this), 0);
    } else {
        str = e.data.toString();
        console.log("got string "+str);
        if (str.substring(0, 5) == "ping:") {
            try {
                this.socket.send('pong:' + str.substring(5));
            } catch (err) {
            }
        }
    }
}

Sock.prototype.msg_drain = function()
{
    if (this.msg_queue) {
        term.write(this.msg_queue);
        this.msg_queue = "";
    }
}

Sock.prototype.encode_send = function(str)
{
    if (this.socket !== null) {
        const view = this.encoder.encode(str);
        this.socket.send(view.buffer);	// TODO use queue?
    }
}

function ui_show_connecting(url)
{
    try {
        new URL(url);
    } catch (_) {
        term.write('\x1b[0;91m');	/* red high intensity */
        term.writeln('"' + url + '" - invalid websocket URL');
        term.write('\x1b[0m');
        return false;
    }

    var el = document.getElementById("wsurl");
    el.value = url;

    el = document.getElementById("net_progress");
    el.style.visibility = "visible";

    term.write('\x1b[0;94m');	/* blue high intensity */
    term.writeln(url + ' - connecting...');
    term.write('\x1b[0m');

    return true;
}

function connect_vm()
{
    var url, params, cols, rows;
    var font_size, width, height, alloc_size;
    var vm_file;

    function term_wrap_onclick_handler()
    {
        var term_wrap_el, w, h, term_bar_el, bar_h;
        term_wrap_el = document.getElementById("term_wrap");
        term_bar_el = document.getElementById("term_bar");
        w = term_wrap_el.clientWidth;
        h = term_wrap_el.clientHeight;
        bar_h = term_bar_el.clientHeight;
        if (term.resizePixel(w, h - bar_h)) {
            console.log("TODO: handle console resize");
        }
    }

    /* read the parameters */

    params = get_params();
    url = params["url"];
    cols = (params["cols"] | 0) || 80;
    rows = (params["rows"] | 0) || 30;
    font_size = (params["font_size"] | 0) || 15;
    width = (params["w"] | 0) || 1024;
    height = (params["h"] | 0) || 640;

    var term_wrap_el;
    width = 0;
    height = 0;

    /* start the terminal */
    term = new Term({ cols: cols, rows: rows, scrollback: 10000, fontSize: font_size });
    term.setKeyHandler(term_handler);
    term.open(document.getElementById("term_container"));

    term_wrap_el = document.getElementById("term_wrap")
    term_wrap_el.style.width = term.term_el.style.width;
    term_wrap_el.onclick = term_wrap_onclick_handler;

    sock_state = null;
    if (typeof url != "undefined" && ui_show_connecting(url)) {
        sock_state = new Sock(url);
    } else {
        term.writeln("Enter QEMU websocket URL above and press connect...");
    }
}

function conn_click()
{
    var url, wsurl_el;

    if (sock_state !== null) {
        sock_state.destroy();
    }

    wsurl_el = document.getElementById("wsurl");
    url = wsurl_el.value;

    if (ui_show_connecting(url)) {
        sock_state = new Sock(url);
        term.termMouseUpHandler();
    }
}

function wsurl_keyup(ev)
{
    /* trigger connect button on enter */
    if (event.keyCode === 13) {
        event.preventDefault();
        document.getElementById("btn_conn").click();
    }
}

(function() {
    var term_wrap_el = document.getElementById("term_wrap");
    term_wrap_el.style.display = "block";
    connect_vm();
})();
