---
title: HTTP的进化史
icon: /assets/icons/article.svg
order: 2
category:
  - Network
date: 2025-08-20
---

## 梦的开始，HTTP/0.9

HTTP最开始的设计，只是为了超文本文档的传输，也就是提供一个单向的文档下载服务，随着时代的发展，HTTP已经发展成了复杂的互联网协议，但是其核心设计还是依旧如初。

最开始的HTTP，是在TCP基础上建立的，并由四个部分组成：

- **HTML**:  用于定义超文本文档的内容格式，便于浏览器解析和渲染，并将其内容呈现给用户；
- **HTTP**：用于定义网络中超文本文档的网络数据传输格式，同时定义了客户端请求和服务端响应的格式；
- **浏览器**：一个用于显示或者编辑超文本文档的客户端（第一个网络浏览器就是我们熟知的`WordWideWeb`，万维网);
- **文档服务器**：一个集中托管超文本文档相关资源和解析浏览器HTTP请求的远端机器；

HTTP的早期设计是非常简单的，是因为它面向的功能和提供的服务相对比较单一。

最开始的HTTP请求由单行指令构成，以唯一方法`GET`，后面是请求的目标文档的路径，一个典型的请求消息内容如下：

```html
GET /test.html
```

同时，服务端的响应也比较简单，直接发送了超文本文档的内容：

```html
<html>
  Hello World!!!
</html>
```

我们可以发现，最开始的HTTP协议，只能传输HTML文件，且没有任何的状态码和错误码出现在服务器的应答里面，最开始的服务器异常信息都是放在一个特殊的HTML文件里返回给客户端的。

HTTP的消息最开始是采用ASCLL编码的，知道HTTP 2.0才引入二进制传输格式。

## 可扩展性协议，HTTP/1.0

随着互联网的普及，互联网应用更加普及开来，网站服务的内容多样性开始增加，处理的业务场景开始增加，HTTP的原始设计已经不能满足日益增加的使用场景，为增加协议的功能和其扩展性，HTTP1.0增加协议内容如下：

- 每个请求需指明自己使用的HTTP协议版本（很多协议都有这样的设计，这是为了便于协议的扩展）；
- 服务器应答增加状态码机制，用于表示服务器对请求的处理结果；
- 为每个HTTP消息包增加HTTP header(头部内容使用键值对的形式表示)，用于描述这些消息的相关属性，我们也叫这个HTTP头为元数据(meta-data);
- 在HTTP头里面提供Content-Type，丰富HTTP针对文档类型的表现能力；

一个典型的HTTP 1.0的请求和应答格式如下：

```html
GET /mypage.html HTTP/1.0
User-Agent: NCSA_Mosaic/2.0 (Windows 3.1)

200 OK
Date: Tue, 15 Nov 1994 08:12:31 GMT
Server: CERN/3.0 libwww/2.17
Content-Type: text/html
<html>
 Hello World
</html>
```

## 首次标准化，HTTP/1.1

HTTP 1.0提出后，并没有立即被纳入到HTTP标准中，只是作为一种尝试和自定义行为，作为一个扩展实现在一些浏览器和服务器中。在HTTP 1.0时代，由于协议规范不够细致，不同的浏览器和服务器对协议的理解存在差异，产生了大量狭义的解释。例如，对于请求头和响应头的处理、缓存机制的实现等方面，不同实现者有不同的做法，这导致了互操作性问题。

为改变现状，HTTP 1.1在RFC（Request for Comments，请求注解）文档中对协议的具体行为表现进行了详细且明确的规定，使得不同厂商开发的浏览器和服务器能够在统一的规范下进行开发和交互，这是大家必须遵守的一个“正式的标准”。

同时HTTP 1.1 也提出了多项改进，比较大的改进点如下：

- **TCP连接复用**: 一个TCP连接可以发送多个HTTP请求，减少了TCP连接的建立和关闭次数，优化了请求的处理时延；
- **管道化**（Pipelining）: 即客户端可以同时发送多个请求，而不需要等待前一个请求的响应，提出并行化请求处理模型进一步来提升效率。
- **分块传输编码**（Chunked Transfer Encoding）: 服务器可以将响应分成多个块进行传输，而不需要等待整个响应体传输完成；
- **内容协商**：引入内容协商机制，包括语言、编码、类型等。并允许客户端和服务器之间约定以最合适的内容进行交换。
- **缓存机制**：客户端可以缓存响应，减少了重复请求的次数，提高了效率；

::: tip

管道化技术并没有得到真正推广，原因是，这里的并行化只体现在客户端，实际服务端的处理还是需要按照顺序返回响应，这仍然会无法避免队头阻塞问题(Head-of-Line Blocking, HOL),  其次，管道化技术提出的并行化处理实现复杂，实现不好很容易出现响应乱序，阻塞问题，在TCP长连接的加持下，完全可以使用TCP连接多开来替代该技术，当然，这为后面队头阻塞问题的解决提供了技术思路，为HTTP/2的多路复用技术奠定了基础；

:::
针对于HTTP1.1协议，我们看到的报文传输内容大致如下：

::: details

```html
# 请求报文
GET /index.html HTTP/1.1
Host: www.example.com
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) 
Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8
Accept-Language: zh-CN,zh;q=0.9
Accept-Encoding: gzip, deflate
Connection: keep-alive

# 服务器应答
HTTP/1.1 200 OK
Date: Wed, 20 Aug 2025 02:30:00 GMT
Server: Apache/2.4.41 (Ubuntu)
Content-Type: text/html; charset=UTF-8
Content-Length: 1256
Connection: keep-alive

<!DOCTYPE html>
<html>
<head>
  <title>Example Page</title>
</head>
<body>
  <h1>Hello, HTTP/1.1!</h1>
  <p>This is a sample response page.</p>
</body>
</html>
```

:::

## 安全加固，HTTPS的出现

随着互联网的发展和网络技术普及，接入到网络设备越来越多，同时接入到网络的人员种类也不断增加，接入到网络的核心业务也日益增多，这给了一些不法的投机分子一些可乘之机，我们知道HTTP的协议报文在网络中完全是明文传输，为保证敏感数据在不信任网络中被人截取造成信息泄露，安全的HTTP协议(HTTPS)诞生了。

HTTPS是通过将HTTP传输的数据通道建立在SSL之上，对HTTP的协议报文加密后在网络中进行传输，从而保证数据的传输安全。

![https通信模型简单示例](/docs/network/http/resource/https-cs-model.drawio.svg)

## HTTP的救赎，REST模式

我们知道，HTTP只定义了数据的传输格式，针对于应用中各种业务场景下，对服务器的所有请求行为，缺乏一个统一的定义，不同应用的开发人员不得不自定义实现自己的接口行为标准，我们知道网络服务的扩展是很快的，缺乏合理性的设计指导，在原有的代码架构上演进将变得非常困难。

其次，在HTTP这种CS架构模式下，浏览器和web Server通常是多对多的一个关系，一个浏览器能够支持访问多种网络服务，同时也支持一个网络服务被多个浏览器访问，如果大家的标准不统一，对于程序的通用性设计也是很难开展的。

在REST出现之前，很多软件针对web请求的API设计更像是一个RPC调用，使用一个动作，放在HTTP请求方法的字段后面，而不是一个抽象的资源，这也违背了HTTP的原始设计，REST的出现为这些问题提供了一个通用的解决方案。

 **REST（Representational State Transfer）** 是一种架构风格，它不是一个协议或者标准。REST的核心思想是将Web看作一个由资源构成的系统，客户端可以访问和操作这些资源，改变资源的状态(Representation)，从而来驱动客户端或者服务端应用状态的迁移。

我们来理解下REST里面的一些核心概念：

1. **资源**：既可以是服务器真实存在的一个文件，也可以是一个抽象的事物(服务，行为等等)，这些都可以被看作是资源；
2. **URI**: 统一的资源标识符(Uniform Resource Identifier)，每个资源在Web上都有一个唯一的表示符，我们将其简称为URI(例如例如：`https://api.example.com/users/123`)，URI 提供了访问和操作资源的入口；
3. **表述操作**：客户端和服务端交互的不是资源的本身，而是资源的一种表述，是资源在某个特定时刻的状态的具体表现形式，这理解起来可能有点抽线，可以理解为，客户端向服务端请求产生的结果是一个时刻，某个资源的一个状态，我们可以使用JSON, XML, HTML, 二进制等多种形式来表示这个状态。
4. **状态转移：** 这是REST最核心的概念，首先RESTful 应用本质上是**无状态的**，首先**服务器端不存储客户端会话状态**，其次**状态由客户端维护和应用驱动**，而状态的转移指的是通过得到资源的表述，来驱动客户端的应用状态发生变化；
5. **无状态通信：** 每个请求独立且自包含；
6. **超媒体驱动 (HATEOAS)：** 理想的 RESTful API 通过返回的超媒体链接指导客户端发现和执行下一步操作，实现应用状态的导航和转移；

## 持续优化的产物，HTTP/2

HTTP 1.1 的流水线技术虽然提出了并行化的概念，但是因为服务端只能顺序响应的限制，以及其实现的复杂性，它已经不能满足日益增长的web体量，其次，队头阻塞也是HTTP交互过程中的一个关键问题，并没有一个比较好的解决方案。

在2015年，为解决以上问题，HTTP2.0标准被正式提出，它相对于HTTP 1.1，又做了以下改进：

- 使用二进制编码协议内容，协议报文对人不再可读；
- 正式引入多路复用技术，在单一的TCP连接里可以并行处理多个请求，处理这些请求不需要按序执行；
- HTTP头压缩，尽可能减少网络中的重复报文传输，降低网络负载；
- 引入服务端推送机制，使得服务器可以主动向客户端推送数据，客户端可以将这些数据进行缓存；

HTTP2.0发布后，在后续的2.x版本又进行了一些扩展，2016年，HTTP的新扩展如下：

- 对 Alt-Svc 的支持允许了给定资源的位置和资源鉴定，允许了更智能的 CDN 缓冲机制；
- 在HTTP头中引入client hint字段(Accept-CH, Critical-CH), 使用该字段去描述一些额外的设备信息；
- 在 Cookie 标头中引入安全相关的前缀，防止Cookie被恶意篡改；

## 航海新时代，HTTP3

2022年，`HTTP/3` 标准正式被提出，在这个标准里面，正式抛弃了`HTTP`对传输层`TCP`的依赖，并提出了为`HTTP`服务的新的传输协议`QUIC`，将其作为HTTP新的传输层，**下文是RFC有关HTTP3的必要性说明**：

> HTTP/1.1 ([[HTTP/1.1](https://datatracker.ietf.org/doc/html/rfc9112)]) uses whitespace-delimited text fields to convey HTTP messages. While these exchanges are human readable, using whitespace for message formatting leads to parsing complexity and excessive tolerance of variant behavior.
>
> Because HTTP/1.1 does not include a multiplexing layer, multiple TCP connections are often used to service requests in parallel. However, that has a negative impact on congestion control and network efficiency, since TCP does not share congestion control across multiple connections.
>
> HTTP/2 ([[HTTP/2](https://datatracker.ietf.org/doc/html/rfc9113)]) introduced a binary framing and multiplexing layer to improve latency without modifying the transport layer. However, because the parallel nature of HTTP/2's multiplexing is not visible to TCP's loss recovery mechanisms, a lost or reordered packet causes all active transactions to experience a stall regardless of whether that transaction was directly impacted by the lost packet.
>
> The QUIC transport protocol incorporates stream multiplexing and per-stream flow control, similar to that provided by the HTTP/2 framing layer. By providing reliability at the stream level and congestion control across the entire connection, QUIC has the capability to improve the performance of HTTP compared to a TCP mapping. QUIC also incorporates TLS 1.3 ([[TLS](https://datatracker.ietf.org/doc/html/rfc8446)]) at the transport layer, offering comparable confidentiality and integrity to running TLS over TCP, with the improved connection setup latency of TCP Fast Open ([[TFO](https://datatracker.ietf.org/doc/html/rfc7413)]).

简单总结下上文就是，针对历史的主流版本`HTTP/1.1`和`HTTP/2`仍然存在很多不足，且从协议层面并没有一个很好的解决方式：

- 针对于`HTTP/1.1`

  - 消息整体格式使用了`ASCLL`编码，且消息内容采用空格进行分段。虽然这些机制保证了`human-readable`,  但是对计算机来说，这无疑大大增加了复杂性(需要处理各种可能的空格和换行符组合)，并且缺乏一个统一的标准，每个应用的实现都也可能大相径庭；
  - 单个连接只能传输单个数据流，缺乏多路复用的设计，这不利于数据的并发传输，虽然使用多个TCP连接能解决这个问题，但是这也带来了更多的时间和资源开销；

- 针对于`HTTP/2`，不再使用`ASCLL`文本, 而是使用二进制文本作为`HTTP`消息的内容格式(`binary framing`)，并且也设计了`multiplexing layer`，使得多个请求可以复用同一个连接, HTTP/2允许多个请求和响应在同一TCP连接上**并发传输**（即多路复用）。这些请求和响应被拆分为多个**数据帧（frames）**，并通过同一个TCP连接发送。这个改进大大提升了连接的利用率和传输带宽，同时也节省了系统资源。

  但这么做并不是万事大吉了，`HTTP/2`的多路复用只体现在`HTTP`协议本身，针对其使用的传输层`TCP`依旧如初。如果`TCP`发生丢包和网络拥塞，`HTTP`协议层不得不进行等待这些关键数据的到来，依赖这个连接的所有的活动事务不得不停止。

  ::: tip 为什么说所有活动事务都会受到影响

  1. 由于TCP将HTTP/2的多路复用连接视为一个整体，当某个数据包丢失时，TCP无法区分哪些数据帧属于哪个具体的HTTP事务。因此，TCP会**暂停整个连接的数据传输**，直到丢失的数据包被恢复。

  2. 即使某些HTTP事务并未直接受到数据包丢失的影响，它们也会因为TCP的暂停机制而**被迫停滞**。这是因为这些事务的数据帧可能被阻塞在TCP的发送缓冲区中，无法继续传输。

  :::

基于以上问题, `HTTP/3` 提出了新的协议模型QUIC：一种使用UDP作为底层传输协议，并在其基础上合并实现了TCP的流控，拥塞控制类似机制，并提供多路复用技术来支持并行化的数据传输。

::: tip 为什么使用UDP

因为类似于`TCP`/`UDP`的协议实现都在`Linux`内核，因为没法将这个标准引入到内核里面去，所以只能基于简单的传输层UDP协议做增强实现。

:::

这里简单介绍下背景，后续有专门的章节介绍`QUIC`协议。
