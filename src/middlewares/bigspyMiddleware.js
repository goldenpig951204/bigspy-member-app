const {
    createProxyMiddleware,
    responseInterceptor
} = require("http-proxy-middleware");
const cheerio = require("cheerio");
const { JSON_to_URLEncoded } = require("../services/utils");
const FormData = require("form-data");

const bigspyMiddleware = (prefix) => createProxyMiddleware({
    target: `https://bigspy.com`,
    selfHandleResponse: true,
    changeOrigin: true,
    onProxyReq: (proxyReq, req) => {
        let userAgent = req.headers["user-agent"];
        let { cookie } = req.proxy;
        proxyReq.setHeader("user-agent", userAgent);
        proxyReq.setHeader("Cookie", cookie);
        
        if (["POST", "PATCH", "PUT"].includes(req.method)) {
            let contentType = proxyReq.getHeader("content-type");
            const writeBody = (bodyData) => {
                proxyReq.setHeader("content-length", Buffer.byteLength(bodyData));
                proxyReq.write(bodyData);
            }
            
            if (contentType && contentType.includes("application/json")) {
                writeBody(JSON.stringify(req.body));
            }

            if (contentType && contentType.includes("application/x-www-form-urlencoded")) {
                let body = JSON_to_URLEncoded(req.body);
                proxyReq.setHeader("content-type", "application/x-www-form-urlencoded");
                writeBody(body);
            }
            
            if (contentType && contentType.includes("multipart/form-data")) {
                const parts = (req.headers['content-type'] + '').split(/boundary=/);
                const boundary = parts[1];

                const form = new FormData();
                form.setBoundary(boundary);
                for (let name in req.body) {
                    form.append(name, req.body[name]);
                }
                for (let file of req.files) {
                    form.append(file["fieldname"], file.buffer, { filename: file["originalname"] });
                }
                let body = form.getBuffer();
                proxyReq.setHeader("content-type", req.headers["content-type"]);
                writeBody(body);
            }
        }
    },
    onProxyRes: responseInterceptor(
        (responseBuffer, proxyRes, req, res) => {
            let domain = `https://${req.headers["host"]}`;
            if (req.url.match(/\.(css|json|js|text|png|jpg|map|ico|svg)/)) {
                return responseBuffer;
            }
            if (typeof req.user == "object" && !req.user.isAdmin && /\/setting/.test(req.path)) {
                proxyRes.statusCode = 301;
                proxyRes.headers["location"] = domain;
                res.statusCode = 301;
                res.setHeader("location", domain);
            }
            if (proxyRes.headers["location"]) {
                proxyRes.headers["location"] = proxyRes.headers["location"].replace("https://bigspy.com", domain);
                res.setHeader("location", proxyRes.headers["location"].replace("https://bigspy.com", domain));
            }
            if (proxyRes.headers["content-type"] && proxyRes.headers["content-type"].includes("text/html")) {
                let response = responseBuffer.toString("utf-8");
                let $ = cheerio.load(response);
                let anchors = $("a");
                anchors.each(function() {
                    let href = $(this).attr("href");
                    if (href !== undefined) {
                        $(this).attr("href", href.replace("https://bigspy.com", domain));
                    }
                });
                let scripts = $("script");
                scripts.each(function() {
                    let src = $(this).attr("src");
                    if (src == undefined) {
                        let content = $(this).html();
                        let newContent = content.replace(/https:\/\/bigspy.com/g, domain);
                        $(this).html(newContent);
                    }
                });
                let iframeTransfer = $("#iframe-transfer");
                iframeTransfer.each(function() {
                    let iframeTarget = $(this).data("target");
                    let iframeUrl = $(this).data("url");
                    $(this).attr("data-target", iframeTarget.replace("https://bigspy.com", domain));
                    $(this).attr("data-url", iframeUrl.replace("https://bigspy.com", domain));
                });
                
                if (typeof req.user == "object" && !req.user.isAdmin) {
                    $("#saasbox-nav .nav-right > .nav-item:nth-child(2) .nav > .nav-link:nth-child(4)").remove();
                    if (/\/user\/user-info/.test(req.path)) {
                        $("html").append("<style>#pane-profile button {display: none}</style>");
                        $(".popup-user-info-sign el-a").remove();
                        $("#pane-profile button").remove();
                        $(".popup-user-info-sign .user-info-button").remove();
                    }
                }
                return $.html();
            }
            return responseBuffer;
        }
    ),
    prependPath: true,
    secure: false,
    hostRewrite: true,
    headers: {
        referer: "https://bigspy.com",
        origin: "https://bigspy.com"
    },
    autoRewrite: true,
    ws: true
});



module.exports = bigspyMiddleware;