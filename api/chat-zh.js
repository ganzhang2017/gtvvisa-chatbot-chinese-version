// api/chat-zh.js - With diagnostic logging added
import { OpenAI } from 'openai';

// Simple OpenRouter client initialization
let openai = null;

function getClient() {
    if (!openai && process.env.OPENROUTER_API_KEY) {
        openai = new OpenAI({
            apiKey: process.env.OPENROUTER_API_KEY,
            baseURL: "https://openrouter.ai/api/v1",
            defaultHeaders: {
                "HTTP-Referer": "https://localhost:3000",
                "X-Title": "UK Global Talent Visa Assistant - Chinese",
            }
        });
    }
    return openai;
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { message, resumeContent } = req.body;

        if (!message) {
            return res.status(400).json({ error: 'No message provided' });
        }

        if (message === 'test connection') {
            return res.status(200).json({ 
                response: '中文API连接成功！🇨🇳' 
            });
        }

        // Check if this is one of the 4 guided questions - return prepared answers immediately
        const guidedQuestions = [
            '数字技术路线的申请资格要求是什么？',
            'Tech Nation申请流程如何运作？请包括所有费用。', 
            '我需要准备什么文件和证据？',
            '整个过程需要多长时间？'
        ];

        if (guidedQuestions.includes(message)) {
            return res.status(200).json({ 
                response: getPreparedAnswer(message)
            });
        }

        // For other questions, try AI if API key available
        if (!process.env.OPENROUTER_API_KEY) {
            return res.status(200).json({ 
                response: getSimpleFallback(message)
            });
        }

        const client = getClient();
        if (!client) {
            return res.status(200).json({ 
                response: getSimpleFallback(message)
            });
        }

        // ===== DIAGNOSTIC LOGGING ADDED HERE =====
        console.log('=== DIAGNOSTIC INFO ===');
        console.log('Message:', message.substring(0, 100));
        console.log('Has resumeContent:', !!resumeContent);
        console.log('Resume content length:', resumeContent ? resumeContent.length : 0);
        if (resumeContent) {
            console.log('Resume content first 300 chars:', resumeContent.substring(0, 300));
            console.log('Resume content last 300 chars:', resumeContent.substring(resumeContent.length - 300));
        }
        console.log('=== END DIAGNOSTIC ===');
        // ===== END DIAGNOSTIC LOGGING =====

        // Try working models
        let completion;
        const workingModels = [
            "openai/gpt-oss-20b:free",
            "google/gemini-2.0-flash-exp:free", 
            "deepseek/deepseek-chat-v3.1:free"
        ];

        for (const model of workingModels) {
            try {
                let systemPrompt = `你是英国全球人才签证专家，专门协助Tech Nation数字技术路线申请。请用中文回答，提供具体可行的建议。`;
                
                if (resumeContent) {
                    const resumeExcerpt = resumeContent.substring(0, 1500);
                    
                    // ===== DIAGNOSTIC LOGGING ADDED HERE =====
                    console.log('=== RESUME ANALYSIS DIAGNOSTIC ===');
                    console.log('Resume excerpt being sent to AI (length:', resumeExcerpt.length, ')');
                    console.log('Resume excerpt content:', resumeExcerpt);
                    console.log('=== END RESUME DIAGNOSTIC ===');
                    // ===== END DIAGNOSTIC LOGGING =====
                    
                    systemPrompt += `\n\n用户已提供简历信息：${resumeExcerpt}\n\n请基于用户的具体背景提供个性化建议。要求：\n1. 必须明确提及用户的当前或最近职位\n2. 根据经验判断适合哪个路线\n3. 推荐最强的2个评估标准\n4. 提供3个最重要的下一步行动\n\n格式要求：使用简洁清晰的格式，用 • 作为项目符号，避免过多粗体。`;
                }

                completion = await Promise.race([
                    client.chat.completions.create({
                        model: model,
                        messages: [
                            {
                                role: "system",
                                content: systemPrompt
                            },
                            {
                                role: "user", 
                                content: message
                            }
                        ],
                        max_tokens: 1000,
                        temperature: 0.7,
                    }),
                    new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('Timeout')), 15000)
                    )
                ]);
                console.log(`成功使用模型: ${model}`);
                
                // ===== DIAGNOSTIC LOGGING ADDED HERE =====
                const aiResponse = completion.choices[0]?.message?.content;
                if (aiResponse && resumeContent) {
                    console.log('=== AI RESPONSE DIAGNOSTIC ===');
                    console.log('AI response length:', aiResponse.length);
                    console.log('AI response first 500 chars:', aiResponse.substring(0, 500));
                    console.log('=== END AI RESPONSE DIAGNOSTIC ===');
                }
                // ===== END DIAGNOSTIC LOGGING =====
                
                break;
            } catch (modelError) {
                console.log(`模型 ${model} 失败:`, modelError.message);
                if (model === workingModels[workingModels.length - 1]) {
                    throw modelError;
                }
                continue;
            }
        }

        const response = completion?.choices[0]?.message?.content;
        
        if (response) {
            return res.status(200).json({ response });
        } else {
            return res.status(200).json({ 
                response: getSimpleFallback(message)
            });
        }

    } catch (error) {
        console.error('API错误:', error.message);
        return res.status(200).json({ 
            response: getSimpleFallback(req.body?.message || '')
        });
    }
}

// Get prepared answers for the 4 guided questions (clean formatting)
function getPreparedAnswer(question) {
    if (question === '数字技术路线的申请资格要求是什么？') {
        return `英国全球人才签证申请资格要求：

1. 适合的申请人

技术类申请人（程序员、工程师、数据科学家等），不论是否来自科技公司，都有资格。

商业类申请人（产品经理、投资人、商业负责人等），前提是来自数字科技公司。

通常不具备资格的情况：非科技公司的非技术岗位、外包、咨询、服务交付、传统大公司管理岗位。

2. 符合条件的技能示例

技术类技能：

软件工程师（前端、后端、DevOps、系统、移动端、游戏、区块链、AI/ML、网络安全、UX/UI、VR/AR 等）

数据科学家 / 数据工程师

在高速成长的科技公司担任 CTO、工程副总裁等管理职务

商业类技能：

主导过大额风投资金（2500万英镑以上）

在产品驱动型科技公司担任商业/运营负责人

产品经理、SaaS 或企业销售领导、效果营销专家

中小型科技公司的 CEO / COO / CIO / 运营负责人

具备投资业绩的高级 VC / PE 分析师

3. 不被认可的技能

外包、咨询（技术/管理）、ERP、系统运维

大企业的常规管理岗位

初级投资岗位（没有投资业绩支撑）

非产品型的服务公司（广告代理、外包公司等）

4. 定义

数字科技/产品驱动公司 = 主要收入来自自主开发的数字产品、平台、服务或硬件。
（不包括一般咨询、外包、以服务交付为主的公司。）

5. 申请路径

杰出人才（Exceptional Talent）：近 5 年在数字科技领域被公认为行业领军人物。需满足 1 条强制标准 + 2 条可选标准，并提供相应证据（创新、行业认可、重要贡献、学术成果等）。

杰出潜力（Exceptional Promise）：被认可为未来有潜力成为行业领军人物（通常在科技领域工作不足 5 年）。需满足同样的标准，但适用早期职业发展者。

下一步评估：确认您的工作职责确实属于数字技术核心领域，而非支持性或使用性角色。更多信息请联系info@sagefyai.com`;
    }
    
    if (question === 'Tech Nation申请流程如何运作？请包括所有费用。') {
        return `Tech Nation申请完整流程与费用：

📋 两阶段申请流程

第一阶段：Tech Nation背书申请
• 申请对象：Tech Nation（独立技术评估机构）
• 申请费用：£561（不可退还）
• 处理时间：8-12周（标准），3-5周（加急+£500-£1,500）
• 申请方式：在线门户系统提交
• 要求：提交完整的证据包和所有文件

第二阶段：内政部签证申请
• 申请对象：英国内政部移民局
• 申请费用：£205
• 处理时间：3周（境外），8周（境内）
• 前提条件：必须先获得Tech Nation背书
• 额外要求：生物识别预约，医疗检查

💰 详细费用清单

主申请人费用：
• Tech Nation背书费：£561
• 内政部签证费：£205
• 医疗附加费（5年）：£5,175
• 主申请人总计：£5,941

家属费用（配偶+子女）：
• 每人签证费：£205
• 每人医疗附加费（5年）：£5,175
• 每位家属：£5,380

可选加急费用：
• Tech Nation加急处理：£500-£1,500
• 内政部优先服务：£500-£800

📅 申请时间规划：
1. 材料准备：3-6个月
2. Tech Nation申请：8-12周处理
3. 内政部签证：3-8周处理
4. 总体时间：6-10个月

💡 费用节省建议：选择标准处理时间，确保材料完整避免重新申请。`;
    }
    
    if (question === '我需要准备什么文件和证据？') {
        return `申请文件和证据完整清单：

📄 强制性文件（所有申请人必须提供）

1. 护照或国民身份证
2. 个人简历（最多3页）
   • 重点突出数字技术领域的职业发展
   • 包含量化的成就和影响力数据
3. 个人陈述（最多1,000字）
   • 说明如何满足申请标准
   • 描述在数字技术领域的具体工作
   • 阐述来英国后的计划
4. 推荐信（3封）
   • 来自数字技术领域的知名专业人士
   • 推荐人必须了解您的工作和成就
   • 专门为此申请撰写，包含推荐人完整资历

📂 证据组合（最多10项，需满足至少2个标准）

标准1 - 行业外部认可：
• 主流媒体对您工作的报道和采访
• 重要技术会议的主题演讲邀请
• 行业奖项、荣誉和认可
• 专家委员会、顾问职位
• 行业报告中的专家引用

标准2 - 技术专业能力：
• 开源项目的贡献统计（GitHub stars, forks, downloads）
• 技术论文在知名期刊或会议的发表
• 获得的技术专利
• 同行专家的技术认可和引用
• 重要技术项目的领导角色

标准3 - 学术贡献或商业成功：
• 学术研究论文和被引用情况
• 产品发布的成功指标和用户数据
• 直接负责的收入增长和业务成果
• 重要的商业合作协议和伙伴关系
• 融资或投资成功案例

标准4 - 技术创新：
• 开发的新技术或方法论
• 对现有技术的重大改进
• 数字化转型项目的领导
• 创新解决方案的实施
• 技术突破和行业影响

📋 证据质量标准：
• 外部认可 > 内部认可
• 量化数据 > 定性描述
• 近期证据 > 历史成就（优先最近5年）
• 第三方验证 > 自我声明
更多信息请联系info@sagefyai.com`;
    }
    
    if (question === '整个过程需要多长时间？') {
        return `英国全球人才签证完整时间线：

⏰ 准备阶段：3-6个月

材料收集与整理：2-4个月
• 梳理职业成就和量化数据
• 收集媒体报道、奖项证书
• 整理开源贡献、专利文档
• 准备商业成功案例和数据

推荐信获取：1-2个月
• 确定并联系3位合适的推荐人
• 等待推荐人撰写专门推荐信
• 确保推荐信质量和完整性

文档撰写：2-4周
• 撰写个人陈述（1000字以内）
• 整理和优化简历（3页以内）
• 准备在线申请表格

📋 官方处理阶段

Tech Nation背书申请：
• 标准处理：8-12周
• 加急处理：3-5周（需额外£500-£1,500）
• 决定类型：批准/拒绝（如拒绝，6个月后才可重新申请）

内政部签证申请：
• 英国境外申请：3周
• 英国境内申请：8周  
• 加急处理：1周（需额外£500-£800）
• 生物识别预约：通常1-2周内安排

🗓️ 总体时间规划

• 最快情况：4-5个月
  （准备3个月 + 加急处理1-2个月）
• 标准情况：7-9个月
  （准备4个月 + 标准处理3-5个月）
• 保守估算：10-12个月
  （包含可能的材料补充和延误）

📅 关键时间提醒：
• 签证有效期从批准日开始计算，不是入境日
• 可在英国境内或境外申请，处理时间不同
• 如计划特定时间入境，建议提前12个月开始准备

⚡ 时间优化建议：
• 并行准备材料和联系推荐人
• 提前研究评估标准，专注最强领域
• 考虑加急处理如有紧急时间需求
• 预留缓冲时间应对可能的补充材料要求
更多信息请联系info@sagefyai.com `;
    }
    
    return "未找到对应的预设回答。";
}

// Fallback for non-guided questions
function getSimpleFallback(message) {
    const query = message.toLowerCase();
    
    // 申请资格 - eligibility
    if (query.includes('申请资格') || query.includes('资格') || query.includes('eligibility')) {
        return `英国全球人才签证申请资格：

基本要求：
• 经验要求：数字技术领域至少5年工作经验
• 工作性质：必须是在数字技术领域工作，不仅仅是使用技术
• 年龄要求：无年龄限制
• 教育要求：无特定学历要求

两个申请路线：

1. 杰出人才路线（Exceptional Talent）
• 适合已被认可的行业领导者
• 在过去5年内获得行业认可
• 处于职业成熟阶段

2. 杰出潜力路线（Exceptional Promise）
• 适合有领导潜力的早期职业者
• 在过去5年内展现出潜力
• 处于职业早期阶段

评估标准：
• 必须满足所有强制性标准
• 必须满足4个可选标准中的至少2个

下一步评估：确认您的工作确实在数字技术领域，计算您的相关经验年限。`;
    }
    
    // Default response
    return `英国全球人才签证核心信息：

申请概要：
• 数字技术领域专业签证
• 无需雇主担保
• 5年有效期，可延期
• 3-5年后可申请永居

基本要求：
• 5年以上相关经验
• 证明杰出才能或潜力
• 满足评估标准

申请流程：
1. Tech Nation背书（£561，8-12周）
2. 内政部签证（£205，3-8周）

总费用：£766 + £5,175医疗附加费

关键成功因素：
• 外部认可的证据
• 量化的成就数据
• 高质量推荐信
• 清晰的个人陈述

请告诉我您想了解的具体方面，我可以提供更详细的指导！更多信息请联系info@sagefyai.com `;
}