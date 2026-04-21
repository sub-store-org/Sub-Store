import $ from '@/core/app';

const ISOFlags = {
    '🏳️‍🌈': ['EXP', 'BAND'],
    '🇸🇱': ['TEST', 'SOS'],
    '🇲🇵': ['MP', 'MNP'],
    '🇸🇴': ['SO', 'SOM'],
    '🇦🇶': ['AQ', 'ATA'],
    '🇦🇬': ['AG', 'ATG'],
    '🇬🇱': ['GL', 'GRL'],
    '🇿🇼': ['ZW', 'ZWE'],
    '🇦🇼': ['AW', 'ABW'],
    '🇲🇱': ['ML', 'MLI'],
    '🇦🇩': ['AD', 'AND'],
    '🇦🇪': ['AE', 'ARE'],
    '🇦🇫': ['AF', 'AFG'],
    '🇦🇱': ['AL', 'ALB'],
    '🇦🇲': ['AM', 'ARM'],
    '🇦🇷': ['AR', 'ARG'],
    '🇦🇹': ['AT', 'AUT'],
    '🇦🇺': ['AU', 'AUS'],
    '🇦🇿': ['AZ', 'AZE'],
    '🇧🇦': ['BA', 'BIH'],
    '🇧🇩': ['BD', 'BGD'],
    '🇧🇪': ['BE', 'BEL'],
    '🇧🇬': ['BG', 'BGR'],
    '🇧🇭': ['BH', 'BHR'],
    '🇧🇴': ['BO', 'BOL'],
    '🇧🇳': ['BN', 'BRN'],
    '🇧🇷': ['BR', 'BRA'],
    '🇧🇹': ['BT', 'BTN'],
    '🇧🇾': ['BY', 'BLR'],
    '🇨🇦': ['CA', 'CAN'],
    '🇨🇫': ['CF', 'CAF'],
    '🇨🇭': ['CH', 'CHE'],
    '🇨🇱': ['CL', 'CHL'],
    '🇨🇴': ['CO', 'COL'],
    '🇨🇷': ['CR', 'CRI'],
    '🇨🇾': ['CY', 'CYP'],
    '🇨🇿': ['CZ', 'CZE'],
    '🇩🇪': ['DE', 'DEU'],
    '🇩🇰': ['DK', 'DNK'],
    // 新增阿尔及利亚 ISO 代码
    '🇩🇿': ['DZ', 'DZA'],
    '🇪🇨': ['EC', 'ECU'],
    '🇪🇪': ['EE', 'EST'],
    '🇪🇬': ['EG', 'EGY'],
    '🇪🇸': ['ES', 'ESP'],
    '🇪🇺': ['EU'],
    '🇫🇮': ['FI', 'FIN'],
    '🇫🇷': ['FR', 'FRA'],
    '🇬🇧': ['GB', 'GBR', 'UK'],
    '🇬🇪': ['GE', 'GEO'],
    '🇬🇷': ['GR', 'GRC'],
    '🇬🇹': ['GT', 'GTM'],
    '🇬🇺': ['GU', 'GUM'],
    '🇭🇰': ['HK', 'HKG', 'HKT', 'HKBN', 'HGC', 'WTT', 'CMI'],
    '🇭🇷': ['HR', 'HRV'],
    '🇭🇺': ['HU', 'HUN'],
    '🇮🇶': ['IQ', 'IRQ'], // 伊拉克
    '🇯🇴': ['JO', 'JOR'],
    '🇯🇵': ['JP', 'JPN', 'TYO'],
    '🇰🇪': ['KE', 'KEN'],
    '🇰🇬': ['KG', 'KGZ'],
    '🇰🇭': ['KH', 'KGZ'],
    '🇰🇵': ['KP', 'PRK'],
    '🇰🇷': ['KR', 'KOR', 'SEL'],
    '🇰🇿': ['KZ', 'KAZ'],
    '🇮🇩': ['ID', 'IDN'],
    '🇮🇪': ['IE', 'IRL'],
    '🇮🇱': ['IL', 'ISR'],
    '🇮🇲': ['IM', 'IMN'],
    '🇮🇳': ['IN', 'IND'],
    '🇮🇷': ['IR', 'IRN'],
    '🇮🇸': ['IS', 'ISL'],
    '🇮🇹': ['IT', 'ITA'],
    '🇱🇦': ['LA', 'LAO'],
    '🇱🇰': ['LK', 'LKA'],
    '🇱🇸': ['LS', 'LSO'],
    '🇱🇹': ['LT', 'LTU'],
    '🇱🇺': ['LU', 'LUX'],
    '🇱🇻': ['LV', 'LVA'],
    '🇲🇦': ['MA', 'MAR'],
    '🇲🇩': ['MD', 'MDA'],
    '🇳🇬': ['NG', 'NGA'],
    '🇲🇲': ['MM', 'MMR'],
    '🇲🇰': ['MK', 'MKD'],
    '🇲🇳': ['MN', 'MNG'],
    '🇲🇴': ['MO', 'MAC', 'CTM'],
    '🇲🇹': ['MT', 'MLT'],
    '🇲🇽': ['MX', 'MEX'],
    '🇲🇾': ['MY', 'MYS'],
    '🇳🇱': ['NL', 'NLD', 'AMS'],
    '🇳🇴': ['NO', 'NOR'],
    '🇳🇵': ['NP', 'NPL'],
    '🇳🇿': ['NZ', 'NZL'],
    '🇴🇲': ['OM', 'OMN'], // 阿曼
    '🇵🇦': ['PA', 'PAN'],
    '🇵🇪': ['PE', 'PER'],
    '🇵🇭': ['PH', 'PHL'],
    '🇵🇰': ['PK', 'PAK'],
    '🇵🇱': ['PL', 'POL'],
    '🇵🇷': ['PR', 'PRI'],
    '🇵🇹': ['PT', 'PRT'],
    '🇵🇾': ['PY', 'PRY'],
    '🇵🇬': ['PG', 'PNG'],
    '🇶🇦': ['QA', 'QAT'],
    '🇷🇴': ['RO', 'ROU'],
    '🇷🇸': ['RS', 'SRB'],
    '🇷🇪': ['RE', 'REU'],
    '🇷🇺': ['RU', 'RUS'],
    '🇸🇦': ['SA', 'SAU'],
    '🇼🇸': ['WS', 'WSM'],
    '🇸🇪': ['SE', 'SWE'],
    '🇸🇬': ['SG', 'SGP'],
    '🇸🇮': ['SI', 'SVN'],
    '🇸🇰': ['SK', 'SVK'],
    '🇹🇬': ['TG', 'TGO'], // 多哥
    '🇹🇭': ['TH', 'THA'],
    '🇹🇳': ['TN', 'TUN'],
    '🇹🇷': ['TR', 'TUR'],
    '🇹🇼': ['TW', 'TWN', 'CHT', 'HINET', 'ROC'],
    '🇺🇦': ['UA', 'UKR'],
    '🇺🇸': ['US', 'USA', 'LAX', 'SFO', 'SJC'],
    '🇺🇾': ['UY', 'URY'],
    // 新增 梵蒂冈 ISO 代码
    '🇻🇦': ['VA', 'VAT'],
    '🇻🇪': ['VE', 'VEN'],
    '🇻🇳': ['VN', 'VNM'],
    '🇿🇦': ['ZA', 'ZAF', 'JNB'],
    '🇨🇳': ['CN', 'CHN', 'BACK'],
};
// get proxy flag according to its name
export function getFlag(name) {
    // flags from @KOP-XIAO: https://github.com/KOP-XIAO/QuantumultX/blob/master/Scripts/resource-parser.js
    // flags from @surgioproject: https://github.com/surgioproject/surgio/blob/master/lib/misc/flag_cn.ts

    // refer: https://zh.wikipedia.org/wiki/ISO_3166-1二位字母代码
    // refer: https://zh.wikipedia.org/wiki/ISO_3166-1三位字母代码
    const Flags = {
        '🏳️‍🌈': ['流量', '时间', '过期', 'Bandwidth', 'Expire'],
        '🇸🇱': ['应急', '测试节点'],
        '🇲🇵': ['北马里亚纳', 'Northern Mariana Islands', 'Saipan', '塞班'],
        '🇸🇴': ['Somalia', '索马里', '摩加迪沙', 'Mogadishu'],
        '🇦🇶': ['Antarctica', '南极洲', '南极'],
        '🇦🇬': ['Antigua and Barbuda', '安提瓜和巴布达'],
        '🇬🇱': ['Greenland', '格陵兰岛', '格陵兰'],
        '🇿🇼': ['Zimbabwe', '津巴布韦'],
        '🇦🇼': ['Aruba', '阿鲁巴'],
        '🇲🇱': ['Mali', '马里'],
        '🇦🇩': ['Andorra', '安道尔'],
        '🇦🇪': ['United Arab Emirates', '阿联酋', '迪拜', 'Dubai'],
        '🇦🇫': ['Afghanistan', '阿富汗'],
        '🇦🇱': ['Albania', '阿尔巴尼亚', '阿爾巴尼亞'],
        '🇦🇲': ['Armenia', '亚美尼亚'],
        '🇦🇷': ['Argentina', '阿根廷'],
        '🇦🇹': ['Austria', '奥地利', '奧地利', '维也纳'],
        '🇼🇸': ['Samoa', '萨摩亚', '薩摩亞'],
        '🇦🇺': [
            'Australia',
            '澳大利亚',
            '澳洲',
            '墨尔本',
            '悉尼',
            '土澳',
            '京澳',
            '廣澳',
            '滬澳',
            '沪澳',
            '广澳',
            'Sydney',
        ],
        '🇦🇿': ['Azerbaijan', '阿塞拜疆'],
        '🇧🇦': ['Bosnia and Herzegovina', '波黑共和国', '波黑'],
        '🇧🇩': ['Bangladesh', '孟加拉国', '孟加拉'],
        '🇧🇪': ['Belgium', '比利时', '比利時'],
        '🇧🇬': ['Bulgaria', '保加利亚', '保加利亞'],
        '🇧🇭': ['Bahrain', '巴林'],
        '🇧🇷': ['Brazil', '巴西', '圣保罗'],
        '🇧🇳': ['Brunei', '文莱', '汶萊'],
        '🇧🇾': ['Belarus', '白俄罗斯', '白俄'],
        '🇧🇴': ['Bolivia', '玻利维亚'],
        '🇧🇹': ['Bhutan', '不丹', '不丹王国'],
        '🇨🇦': [
            'Canada',
            '加拿大',
            '蒙特利尔',
            '温哥华',
            '楓葉',
            '枫叶',
            '滑铁卢',
            '多伦多',
            'Waterloo',
            'Toronto',
        ],
        '🇨🇫': ['Central African Republic', '中非共和国', '中非'],
        '🇨🇭': ['Switzerland', '瑞士', '苏黎世', 'Zurich'],
        '🇨🇱': ['Chile', '智利'],
        '🇨🇴': ['Colombia', '哥伦比亚'],
        '🇨🇷': ['Costa Rica', '哥斯达黎加'],
        '🇨🇾': ['Cyprus', '塞浦路斯'],
        // 补充 Czech / Czech Republic 匹配
        '🇨🇿': ['Czechia', '捷克', 'Czech', 'Czech Republic'],
        '🇩🇪': [
            'German',
            '德国',
            '德國',
            '京德',
            '滬德',
            '廣德',
            '沪德',
            '广德',
            '法兰克福',
            'Frankfurt',
            '德意志',
        ],
        '🇩🇰': ['Denmark', '丹麦', '丹麥'],
        // 新增 阿尔及利亚
        '🇩🇿': ['Algeria', '阿尔及利亚', '阿爾及利亞'],
        '🇪🇨': ['Ecuador', '厄瓜多尔'],
        '🇪🇪': ['Estonia', '爱沙尼亚'],
        '🇪🇬': ['Egypt', '埃及'],
        '🇪🇸': ['Spain', '西班牙'],
        '🇪🇺': ['European Union', '欧盟', '欧罗巴'],
        '🇫🇮': ['Finland', '芬兰', '芬蘭', '赫尔辛基'],
        '🇫🇷': ['France', '法国', '法國', '巴黎'],
        '🇬🇧': [
            'Great Britain',
            '英国',
            'England',
            'United Kingdom',
            '伦敦',
            '英',
            'London',
        ],
        '🇬🇪': ['Georgia', '格鲁吉亚', '格魯吉亞'],
        '🇬🇷': ['Greece', '希腊', '希臘'],
        '🇬🇺': ['Guam', '关岛', '關島'],
        '🇬🇹': ['Guatemala', '危地马拉'],
        '🇭🇰': [
            'Hongkong',
            '香港',
            'Hong Kong',
            'HongKong',
            'HONG KONG',
            '深港',
            '沪港',
            '呼港',
            '穗港',
            '京港',
            '港',
        ],
        '🇭🇷': ['Croatia', '克罗地亚', '克羅地亞'],
        '🇭🇺': ['Hungary', '匈牙利'],
        '🇮🇶': ['Iraq', '伊拉克', '巴格达', 'Baghdad'], // 伊拉克
        '🇯🇴': ['Jordan', '约旦'],
        '🇯🇵': [
            'Japan',
            '日本',
            '东京',
            '大阪',
            '埼玉',
            '沪日',
            '穗日',
            '川日',
            '中日',
            '泉日',
            '杭日',
            '深日',
            '辽日',
            '广日',
            '大坂',
            'Osaka',
            'Tokyo',
        ],
        '🇰🇪': ['Kenya', '肯尼亚'],
        '🇰🇬': ['Kyrgyzstan', '吉尔吉斯斯坦'],
        '🇰🇭': ['Cambodia', '柬埔寨'],
        '🇰🇵': ['North Korea', '朝鲜'],
        '🇰🇷': [
            'Korea',
            '韩国',
            '韓國',
            '韩',
            '韓',
            '首尔',
            '春川',
            'Chuncheon',
            'Seoul',
        ],
        '🇰🇿': ['Kazakhstan', '哈萨克斯坦', '哈萨克'],
        '🇮🇩': ['Indonesia', '印尼', '印度尼西亚', '雅加达'],
        '🇮🇪': ['Ireland', '爱尔兰', '愛爾蘭', '都柏林'],
        '🇮🇱': ['Israel', '以色列'],
        '🇮🇲': ['Isle of Man', '马恩岛', '馬恩島'],
        '🇮🇳': ['India', '印度', '孟买', 'MFumbai', 'Mumbai'],
        '🇮🇷': ['Iran', '伊朗'],
        '🇮🇸': ['Iceland', '冰岛', '冰島'],
        '🇮🇹': ['Italy', '意大利', '義大利', '米兰', 'Nachash'],
        '🇱🇰': ['Sri Lanka', '斯里兰卡', '斯里蘭卡'],
        '🇱🇦': ['Laos', '老挝', '老撾'],
        '🇱🇸': ['Lesotho', '莱索托'],
        '🇱🇹': ['Lithuania', '立陶宛'],
        '🇱🇺': ['Luxembourg', '卢森堡'],
        '🇱🇻': ['Latvia', '拉脱维亚', 'Latvija'],
        '🇲🇦': ['Morocco', '摩洛哥'],
        '🇲🇩': ['Moldova', '摩尔多瓦', '摩爾多瓦'],
        '🇲🇲': ['Myanmar', '缅甸', '緬甸'],
        '🇳🇬': ['Nigeria', '尼日利亚', '尼日利亞'],
        '🇲🇰': ['Macedonia', '马其顿', '馬其頓'],
        '🇲🇳': ['Mongolia', '蒙古'],
        '🇲🇴': ['Macao', '澳门', '澳門', 'CTM'],
        '🇲🇹': ['Malta', '马耳他'],
        '🇲🇽': ['Mexico', '墨西哥'],
        '🇲🇾': ['Malaysia', '马来', '馬來', '吉隆坡', '大馬'],
        '🇳🇱': [
            'Netherlands',
            '荷兰',
            '荷蘭',
            '尼德蘭',
            '阿姆斯特丹',
            'Amsterdam',
        ],
        '🇳🇴': ['Norway', '挪威'],
        '🇳🇵': ['Nepal', '尼泊尔'],
        '🇳🇿': ['New Zealand', '新西兰', '新西蘭'],
        '🇴🇲': ['Oman', '阿曼', '马斯喀特'],
        '🇵🇦': ['Panama', '巴拿马'],
        '🇵🇪': ['Peru', '秘鲁', '祕魯'],
        '🇵🇭': ['Philippines', '菲律宾', '菲律賓'],
        '🇵🇰': ['Pakistan', '巴基斯坦'],
        '🇵🇱': ['Poland', '波兰', '波蘭', '华沙', 'Warsaw'],
        '🇵🇷': ['Puerto Rico', '波多黎各'],
        '🇵🇹': ['Portugal', '葡萄牙'],
        '🇵🇬': ['Papua New Guinea', '巴布亚新几内亚'],
        '🇵🇾': ['Paraguay', '巴拉圭'],
        '🇶🇦': ['Qatar', '卡塔尔', '卡塔爾'],
        '🇷🇴': ['Romania', '罗马尼亚'],
        '🇷🇸': ['Serbia', '塞尔维亚'],
        '🇷🇪': ['Réunion', '留尼汪', '法属留尼汪'],
        '🇷🇺': [
            'Russia',
            '俄罗斯',
            '俄国',
            '俄羅斯',
            '伯力',
            '莫斯科',
            '圣彼得堡',
            '西伯利亚',
            '京俄',
            '杭俄',
            '廣俄',
            '滬俄',
            '广俄',
            '沪俄',
            'Moscow',
        ],
        '🇸🇦': ['Saudi', '沙特阿拉伯', '沙特', 'Riyadh', '利雅得'],
        '🇸🇪': ['Sweden', '瑞典', '斯德哥尔摩', 'Stockholm'],
        '🇸🇬': [
            'Singapore',
            '新加坡',
            '狮城',
            '沪新',
            '京新',
            '中新',
            '泉新',
            '穗新',
            '深新',
            '杭新',
            '广新',
            '廣新',
            '滬新',
        ],
        '🇸🇮': ['Slovenia', '斯洛文尼亚'],
        '🇸🇰': ['Slovakia', '斯洛伐克'],
        '🇹🇬': ['Togo', '多哥', '洛美', 'Lomé', 'Lome'], // 多哥
        '🇹🇭': ['Thailand', '泰国', '泰國', '曼谷'],
        '🇹🇳': ['Tunisia', '突尼斯'],
        '🇹🇷': ['Turkey', '土耳其', '伊斯坦布尔', 'Istanbul'],
        '🇹🇼': [
            'Taiwan',
            '台湾',
            '臺灣',
            '台灣',
            '中華民國',
            '中华民国',
            '台北',
            '台中',
            '新北',
            '彰化',
            '台',
            '臺',
            'Taipei',
            'Tai Wan',
        ],
        '🇺🇦': ['Ukraine', '乌克兰', '烏克蘭'],
        '🇺🇸': [
            'United States',
            '美国',
            'America',
            '美',
            '京美',
            '波特兰',
            '达拉斯',
            '俄勒冈',
            'Oregon',
            '凤凰城',
            '费利蒙',
            '硅谷',
            '矽谷',
            '拉斯维加斯',
            '洛杉矶',
            '圣何塞',
            '圣克拉拉',
            '西雅图',
            '芝加哥',
            '沪美',
            '哥伦布',
            '纽约',
            'New York',
            'Los Angeles',
            'San Jose',
            'Sillicon Valley',
            'Michigan',
            '俄亥俄',
            'Ohio',
            '马纳萨斯',
            'Manassas',
            '弗吉尼亚',
            'Virginia',
        ],
        '🇺🇾': ['Uruguay', '乌拉圭'],
        // 新增 梵蒂冈 及别名
        '🇻🇦': ['Vatican', 'Vatican City', 'Holy See', '梵蒂冈', '梵蒂岡'],
        '🇻🇪': ['Venezuela', '委内瑞拉'],
        '🇻🇳': ['Vietnam', '越南', '胡志明'],
        '🇿🇦': ['South Africa', '南非'],
        '🇨🇳': [
            'China',
            '中国',
            '中國',
            '回国',
            '回國',
            '国内',
            '國內',
            '华东',
            '华西',
            '华南',
            '华北',
            '华中',
            '江苏',
            '北京',
            '上海',
            '广州',
            '深圳',
            '杭州',
            '徐州',
            '青岛',
            '宁波',
            '镇江',
        ],
    };

    // 原旗帜或空
    let Flag =
        name.match(/[\uD83C][\uDDE6-\uDDFF][\uD83C][\uDDE6-\uDDFF]/)?.[0] ||
        '🏴‍☠️';
    //console.log(`oldFlag = ${Flag}`)
    // 旗帜匹配
    for (let flag of Object.keys(Flags)) {
        const keywords = Flags[flag];
        //console.log(`keywords = ${keywords}`)
        if (
            // 不精确匹配（只要包含就算,忽略大小写)
            keywords.some((keyword) => RegExp(`${keyword}`, 'i').test(name))
        ) {
            if (/内蒙古/.test(name) && ['🇲🇳'].includes(flag)) {
                return (Flag = '🇨🇳');
            }
            return (Flag = flag);
        }
    }
    // ISO旗帜匹配
    for (let flag of Object.keys(ISOFlags)) {
        const keywords = ISOFlags[flag];
        //console.log(`keywords = ${keywords}`)
        if (
            // 精确匹配(两侧均有分割)
            keywords.some((keyword) =>
                RegExp(`(^|[^a-zA-Z])${keyword}([^a-zA-Z]|$)`).test(name),
            )
        ) {
            const isCN2 =
                flag == '🇨🇳' &&
                RegExp(`(^|[^a-zA-Z])CN2([^a-zA-Z]|$)`).test(name);
            if (!isCN2) {
                return (Flag = flag);
            }
        }
    }

    //console.log(`Final Flag = ${Flag}`)
    return Flag;
}

export function getISO(name) {
    return ISOFlags[getFlag(name)]?.[0];
}

// remove flag
export function removeFlag(str) {
    return str
        .replace(/[\uD83C][\uDDE6-\uDDFF][\uD83C][\uDDE6-\uDDFF]|🏴‍☠️|🏳️‍🌈/g, '')
        .trim();
}

export class MMDB {
    constructor({ country, asn } = {}) {
        if ($.env.isNode) {
            const Reader = eval(`require("@maxmind/geoip2-node")`).Reader;
            const fs = eval("require('fs')");
            const countryFile =
                country || eval('process.env.SUB_STORE_MMDB_COUNTRY_PATH');
            const asnFile = asn || eval('process.env.SUB_STORE_MMDB_ASN_PATH');
            // $.info(
            //     `GeoLite2 Country MMDB: ${countryFile}, exists: ${fs.existsSync(
            //         countryFile,
            //     )}`,
            // );
            if (countryFile) {
                this.countryReader = Reader.openBuffer(
                    fs.readFileSync(countryFile),
                );
            }
            // $.info(
            //     `GeoLite2 ASN MMDB: ${asnFile}, exists: ${fs.existsSync(
            //         asnFile,
            //     )}`,
            // );
            if (asnFile) {
                if (!fs.existsSync(asnFile))
                    throw new Error('GeoLite2 ASN MMDB does not exist');
                this.asnReader = Reader.openBuffer(fs.readFileSync(asnFile));
            }
        }
    }
    geoip(ip) {
        return this.countryReader?.country(ip)?.country?.isoCode;
    }
    ipaso(ip) {
        return this.asnReader?.asn(ip)?.autonomousSystemOrganization;
    }
    ipasn(ip) {
        return this.asnReader?.asn(ip)?.autonomousSystemNumber;
    }
}
