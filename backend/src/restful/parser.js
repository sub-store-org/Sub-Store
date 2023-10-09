import { success, failed } from '@/restful/response';
import { ProxyUtils } from '@/core/proxy-utils';
import { RuleUtils } from '@/core/rule-utils';

export default function register($app) {
    $app.route('/api/proxy/parse').post(proxy_parser);
    $app.route('/api/rule/parse').post(rule_parser);
}
/***
 * 代理服务器协议转换接口。
 * 请求方法为POST，数据为json。需要提供data和client字段。
 * data: string, 协议数据，每行一个或者是clash
 * client: string, 目标平台名称，见backend/src/core/proxy-utils/producers/index.js
 *
 */
function proxy_parser(req, res) {
    const { data, client } = req.body;
    var result = {};
    try {
        var proxies = ProxyUtils.parse(data);
        var par_res = ProxyUtils.produce(proxies, client);
        result['par_res'] = par_res;
    } catch (err) {
        failed(res, err);
    }
    success(res, result);
}
/**
 * 规则转换接口。
 * 请求方法为POST，数据为json。需要提供data和client字段。
 * data: string, 多行规则字符串
 * client: string, 目标平台名称，具体见backend/src/core/rule-utils/producers.js
 */
function rule_parser(req, res) {
    const { data, client } = req.body;
    var result = {};
    try {
        const rules = RuleUtils.parse(data);
        var par_res = RuleUtils.produce(rules, client);
        result['par_res'] = par_res;
    } catch (err) {
        failed(res, err);
    }

    success(res, result);
}
