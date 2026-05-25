`POST https://ark.cn-beijing.volces.com/api/v3/files`

本文介绍使用 Files API 上传文件请求时的输入输出参数，供您使用接口时查阅字段含义。


<Tabs>
<Tab zoneid="FQpBrly1" title="鉴权说明">
<TabTitle>鉴权说明</TabTitle>

本接口支持 API Key /Access Key 鉴权，详见[鉴权认证方式](https://www.volcengine.com/docs/82379/1298459)。


</Tab>
<Tab zoneid="ZMEm3LaGAI" title="快速入口">
<TabTitle>快速入口</TabTitle>

<span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_2abecd05ca2779567c6d32f0ddc7874d.png) </span>[模型列表](https://www.volcengine.com/docs/82379/1330310)    <span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_a5fdd3028d35cc512a10bd71b982b6eb.png) </span>[模型计费](https://www.volcengine.com/docs/82379/1544106)     <span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_57d0bca8e0d122ab1191b40101b5df75.png) </span>[Files](https://www.volcengine.com/docs/82379/1885708)[ API 教程](https://www.volcengine.com/docs/82379/1885708)   <span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_afbcf38bdec05c05089d5de5c3fd8fc8.png) </span>[API Key](https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey?apikey=%7B%7D)


</Tab>
</Tabs>



---



<span id="LGrPmcsa"></span>
## 请求参数

> 跳转 [响应参数](https://www.volcengine.com/docs/82379/1870405#NtL4xXlS)


<span id="5Q8CpXQq"></span>
### 请求体


---



**file** `file` <span data-api-tag="require|5YUKhb">必选</span>

需要上传的文件，要求为二进制文件。具体限制请参见 [Files API教程](https://www.volcengine.com/docs/82379/1885708)。


---



**purpose**  `string` `默认值：user_data` <span data-api-tag="require|zgNDAb">必选</span>

文件用途。

`user_data`：可以灵活使用的文件，能够用于任意用途。


---



**preprocess_configs** `object / null`

用于设置不同文件类型的预处理规则。


属性


---



preprocess_configs.video.**fps** `float / null` `默认值：1`

取值范围：`[0.2，5]`。

每秒钟从视频中抽取指定数量的图像。取值越高，对于视频中画面变化理解越精细；取值越低，对于视频中画面变化感知减弱，但是使用的token花费少，速度也更快。单视频token 用量范围在[10k, 80k]，具体参见[视频理解](https://www.volcengine.com/docs/82379/1895586?lang=zh#.55So6YeP6K-05piO)。


---



preprocess_configs.video.**model** `string`

使用该文件进行推理时，要使用的视频理解模型 ID （Model ID）或 Endpoint ID。

<div data-tips="true" data-tips-type="default" data-tips-is-title="true">说明</div>


<div data-tips="true" data-tips-type="default">Files API 中设置的模型 ID 与推理使用的模型 ID 不强耦合，只影响上传视频文件时预处理抽帧策略。关于预处理抽帧策略，参见<a href="https://www.volcengine.com/docs/82379/1895586?lang=zh#.5oq95bin562W55Wl">抽帧策略</a>。</div>



* 传入模型 ID：传入不同的模型 ID 会采用不同的抽帧策略。

* 传入 Endpoint ID：会按照上传时 Endpoint ID 映射的模型对应的抽帧策略进行抽帧。

* 不传该参数时：默认采用`doubao-seed-1.8`之前的模型对应的抽帧策略。


<div data-tips="true" data-tips-type="warning" data-tips-is-title="true">注意</div>


<div data-tips="true" data-tips-type="warning"><code>doubao-seed-1.8</code>及后续模型支持更长的视频理解能力，抽帧数已从 640 帧提升至 1280 帧。</div>


<div data-tips="true" data-tips-type="warning">如果要使用<code>doubao-seed-1-8-251228</code>进行视频理解，但通过 Files API 上传文件时未设置该模型 ID，则采用的是<code>doubao-seed-1.8</code>之前模型对应的抽帧策略，模型实际理解的帧数会减少。</div>




---



**expire_at** `integer` `默认值：当前时刻+604800`

取值范围：`[当前时刻+86400, 当前时刻+2592000]`，即最少保留1天，最多保留30天。

设置存储的有效期，需要传入UTC Unix时间戳（单位：秒）。

<span id="NtL4xXlS"></span>
## 响应参数

> 跳转 [请求参数](https://www.volcengine.com/docs/82379/1870405#LGrPmcsa)


模型会返回对应的 [file](https://www.volcengine.com/docs/82379/1873424)[ object](https://www.volcengine.com/docs/82379/1873424?type=preview&lang=zh)。


`GET https://ark.cn-beijing.volces.com/api/v3/files/{file_id}`

通过 File id 获取文件信息。


<Tabs>
<Tab zoneid="TIcwAPbc" title="鉴权说明">
<TabTitle>鉴权说明</TabTitle>

本接口支持 API Key /Access Key 鉴权，详见[鉴权认证方式](https://www.volcengine.com/docs/82379/1298459)。


</Tab>
<Tab zoneid="NQzR9pWM" title="快速入口">
<TabTitle>快速入口</TabTitle>

<span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_2abecd05ca2779567c6d32f0ddc7874d.png) </span>[模型列表](https://www.volcengine.com/docs/82379/1330310)    <span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_a5fdd3028d35cc512a10bd71b982b6eb.png) </span>[模型计费](https://www.volcengine.com/docs/82379/1544106)     <span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_57d0bca8e0d122ab1191b40101b5df75.png) </span>[Files](https://www.volcengine.com/docs/82379/1885708)[ API 教程](https://www.volcengine.com/docs/82379/1885708)   <span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_afbcf38bdec05c05089d5de5c3fd8fc8.png) </span>[API Key](https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey?apikey=%7B%7D)


</Tab>
</Tabs>


<span id="YP6bDFZC"></span>
## 请求参数

<span id="wcna9TMz"></span>
### 路径参数


---



id `string` <span data-api-tag="require|at4Lbm">必选</span>

待检索的文件 id。

<span id="5PiUp3nH"></span>
## 响应参数

模型会返回对应的 [file](https://www.volcengine.com/docs/82379/1873424?type=preview&lang=zh)[ object](https://www.volcengine.com/docs/82379/1873424?type=preview&lang=zh)。

`GET https://ark.cn-beijing.volces.com/api/v3/files`

获取文件列表。


<Tabs>
<Tab zoneid="5fz0GorD" title="快速入口">
<TabTitle>快速入口</TabTitle>

<span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_2abecd05ca2779567c6d32f0ddc7874d.png) </span>[模型列表](https://www.volcengine.com/docs/82379/1330310)    <span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_a5fdd3028d35cc512a10bd71b982b6eb.png) </span>[模型计费](https://www.volcengine.com/docs/82379/1544106)     <span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_57d0bca8e0d122ab1191b40101b5df75.png) </span>[Files](https://www.volcengine.com/docs/82379/1885708)[ API 教程](https://www.volcengine.com/docs/82379/1885708)[ ](https://www.volcengine.com/docs/82379/1885708)  <span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_afbcf38bdec05c05089d5de5c3fd8fc8.png) </span>[API Key](https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey?apikey=%7B%7D)


</Tab>
<Tab zoneid="otR1GVWw" title="鉴权说明">
<TabTitle>鉴权说明</TabTitle>

本接口仅支持 API Key 鉴权，请在 [获取 API Key](https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey) 页面，获取长效 API Key。


</Tab>
</Tabs>


<span id="l9Iu16WF"></span>
## 请求参数

> 跳转 [响应参数](https://www.volcengine.com/docs/82379/1870407#nby1fJFs)


<span id="eB97NMCI"></span>
### 查询参数

> 在 URL String 中传入。



---



**after** `string/ null`

返回该文件 ID 之后的文件。


---



**limit** `integer` `默认值：100`

取值范围： 1 ~ 100。

控制单次返回的最大文件数。


---



**purpose** `string`

按文件用途进行筛选，仅返回具有指定用途的文件。


---



**order** `string` `默认值：desc`

按照文件created_at的时间戳顺序，控制文件的排序方式。


*  asc：按照正序排列。

* desc：按照倒序排列。


<span id="nby1fJFs"></span>
## 响应参数

> 跳转 [请求参数](https://www.volcengine.com/docs/82379/1870407#l9Iu16WF)


返回本次响应对应的文件列表。

**object** `string`

固定为`list`。


---



**data** `object[] / null`

文件的列表，与上传文件时的请求参数字段结构完全一致。


---



**first_id** `string`

列表中第一条数据的 ID。


---



**has_more** `boolean`

标识是否还有更多数据未返回。


* true：存在未返回的数据。

* false：已返回全部数据。



---



**last_id** `string`

列表中最后一条数据的 ID。

`DELETE https://ark.cn-beijing.volces.com/api/v3/files/{file_id}`

根据文件ID删除文件，并将文件从存储空间中移除。


<Tabs>
<Tab zoneid="5gPFP2ta" title="快速入口">
<TabTitle>快速入口</TabTitle>

 <span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_2abecd05ca2779567c6d32f0ddc7874d.png) </span>[模型列表](https://www.volcengine.com/docs/82379/1330310)          <span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_a5fdd3028d35cc512a10bd71b982b6eb.png) </span>[模型计费](https://www.volcengine.com/docs/82379/1544106)       <span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_57d0bca8e0d122ab1191b40101b5df75.png) </span>[模型调用教程](https://www.volcengine.com/docs/82379/1585128)    <span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_afbcf38bdec05c05089d5de5c3fd8fc8.png) </span>[API Key](https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey?apikey=%7B%7D)


</Tab>
<Tab zoneid="enBSXJ0V" title="鉴权说明">
<TabTitle>鉴权说明</TabTitle>

本接口仅支持 API Key 鉴权，请在 [获取 API Key](https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey) 页面，获取长效 API Key。


</Tab>
</Tabs>


<span id="hnU4cNWd"></span>
## 请求参数

<span id="Uxe9XAQw"></span>
### 路径参数


---



**id** `string` <span data-api-tag="require|yM0oK2">必选</span>

待删除的文件id。

<span id="0EtRjtOR"></span>
## 响应参数


---



**id** `string`

被删除的文件id。


---



**object** `string`

固定为 `file`。


---



**deleted** `boolean`

文件被删除，取值`true`表明删除成功。
