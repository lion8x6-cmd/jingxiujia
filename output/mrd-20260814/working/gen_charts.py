#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch
import os
plt.rcParams['font.family']='Heiti SC'; plt.rcParams['axes.unicode_minus']=False
OUT='/Users/mr.baihe/WorkBuddy/P 图修图-精修家/output/mrd-20260814/stage2/images'
os.makedirs(OUT,exist_ok=True)
D='#1A3C6E'; B='#2C5FA0'; L='#3A7AC4'; A='#E8734A'; G='#2E9E6B'; GR='#888888'; LB='#E8F0FE'
def sv(f,n): f.savefig(os.path.join(OUT,n),dpi=200,bbox_inches='tight',facecolor='white'); plt.close(f); print('ok',n)
def rbox(ax,x,y,w,h,fc,ec='none',lw=0,r=0.08,ls='-'):
    b=FancyBboxPatch((x,y),w,h,boxstyle=f"round,pad={r}",facecolor=fc,edgecolor=ec,linewidth=lw,linestyle=ls); ax.add_patch(b); return b
def txt(ax,x,y,t,**kw): ax.text(x,y,t,ha='center',va='center',**kw)
def arr(ax,x1,y1,x2,y2,c=GR,lw=1.5): ax.annotate('',xy=(x2,y2),xytext=(x1,y1),arrowprops=dict(arrowstyle='->',color=c,lw=lw))

# === 图1-1 市场分类 ===
f,ax=plt.subplots(figsize=(10,5.5)); ax.set_xlim(0,10); ax.set_ylim(0,6); ax.axis('off')
rbox(ax,3.5,5,3,0.7,D); txt(ax,5,5.35,'修图产品',fontsize=16,color='white',fontweight='bold')
ax.plot([5,5],[5,4.3],color=GR,lw=1.5); ax.plot([2.2,7.8],[4.3,4.3],color=GR,lw=1.5)
ax.plot([2.2,2.2],[4.3,3.8],color=GR,lw=1.5); ax.plot([7.8,7.8],[4.3,3.8],color=GR,lw=1.5)
rbox(ax,0.9,3.2,2.6,0.6,B); txt(ax,2.2,3.5,'手动修图工具',fontsize=13,color='white',fontweight='bold')
rbox(ax,6.5,3.2,2.6,0.6,B); txt(ax,7.8,3.5,'代修服务',fontsize=13,color='white',fontweight='bold')
for i,t in enumerate(['醒图','美图秀秀','其他App']):
    x=0.8+i*1.4; rbox(ax,x-0.55,1.8,1.1,0.5,LB,L,1.2); txt(ax,x,2.05,t,fontsize=9.5,color=D)
ax.plot([2.2,2.2],[3.2,2.6],c=GR); ax.plot([0.8,3.6],[2.6,2.6],c=GR)
for i in range(3): ax.plot([0.8+i*1.4]*2,[2.6,2.3],c=GR)
rbox(ax,0.3,0.4,3.8,1.0,'#FFF3E8',A,1.2); txt(ax,2.2,1.15,'核心痛点',fontsize=9,color=A,fontweight='bold'); txt(ax,2.2,0.7,'门槛高·等待久·试错多',fontsize=8.5,color='#666')
ax.plot([7.8,7.8],[3.2,2.6],c=GR); ax.plot([6.2,9.4],[2.6,2.6],c=GR)
for x,lab,fc,ec in [(6.2,'人工代修','#F5F5F5',GR),(9.4,'AI代修(我们)','#E6F7EF',G)]:
    ax.plot([x,x],[2.6,2.3],c=ec,lw=1.5); rbox(ax,x-0.9,1.8,1.8,0.5,fc,ec,1.5)
    txt(ax,x,2.05,lab,fontsize=10,color=ec,fontweight='bold' if ec==G else 'normal')
for x,sub1,sub2,fc,ec in [(6.2,'闲鱼卖家','2-20元/张·等待久','#F8F8F8',GR),(9.4,'一键精修','0.3-0.6元/次·数十秒','#E6F7EF',G)]:
    ax.plot([x,x],[1.8,1.4],c=ec); rbox(ax,x-1.4,0.5,2.8,0.8,fc,ec,1); txt(ax,x,1.1,sub1,fontsize=8.5,color=D); txt(ax,x,0.7,sub2,fontsize=7.5,color=ec)
sv(f,'fig1-1-market-classification.png')

# === 图2-1 用户画像 ===
f,axes=plt.subplots(1,2,figsize=(10,5.5))
for ax,(title,c,items,star) in zip(axes,[
    ('非目标用户',GR,[('长相','出众，基础条件好'),('修图技能','熟练，会调色温色调'),('使用方式','微调即可出片'),('工具依赖','低，不需要代修'),('使用频率','高频，天天拍照')],False),
    ('核心目标用户 ★',G,[('长相','平平，需要调整的多'),('修图技能','不熟练，改来改去四不像'),('使用方式','需要大幅调整'),('工具依赖','高，但自己修不好'),('使用频率','低频，偶尔需要')],True)]):
    ax.set_xlim(0,10); ax.set_ylim(0,10); ax.axis('off')
    rbox(ax,0.3,8.8,9.4,0.9,c); txt(ax,5,9.25,title,fontsize=15,color='white',fontweight='bold')
    for i,(k,v) in enumerate(items):
        y=7.5-i*1.4; rbox(ax,0.5,y-0.1,1.6,0.5,'#E6F7EF' if star else LB,c,1)
        txt(ax,1.3,y+0.15,k,fontsize=9.5,color=c,fontweight='bold')
        ax.text(2.5,y+0.15,v,ha='left',va='center',fontsize=9.5,color='#333')
plt.tight_layout(); sv(f,'fig2-1-user-persona.png')

# === 图5-1 流程对比 ===
f,ax=plt.subplots(figsize=(11,4.5)); ax.set_xlim(0,11); ax.set_ylim(0,5); ax.axis('off')
txt(ax,5.5,4.7,'使用流程对比',fontsize=16,fontweight='bold',color=D)
txt(ax,0.3,3.9,'竞品（醒图/美图）',fontsize=11,color=GR,fontweight='bold')
steps=['打开App','选模板','等10-20s','换模板','再等渲染','手动微调','瘦脸瘦腿','完成']
for i,s in enumerate(steps):
    x=1.5+i*1.15; rbox(ax,x-0.45,3.3,0.9,0.55,'#F0F0F0',ec=GR,lw=1,r=0.05); txt(ax,x,3.57,s,fontsize=7,color='#555')
    if i<7: arr(ax,x+0.55,3.57,x+0.7,3.57,GR,1)
txt(ax,10.7,3.57,'😫',fontsize=14)
ax.plot([0.5,10.5],[2.5,2.5],c='#E0E0E0',ls='--')
txt(ax,0.3,1.9,'AI一键精修（我们）',fontsize=11,color=G,fontweight='bold')
for i,(s,c) in enumerate([('丢图',D),('生图',B),('看图',G)]):
    x=3.5+i*2.2; rbox(ax,x-0.7,1.1,1.4,0.8,c); txt(ax,x,1.5,s,fontsize=14,color='white',fontweight='bold')
    if i<2: arr(ax,x+0.8,1.5,x+1.4,1.5,G,2.5)
txt(ax,9.2,1.5,'✨',fontsize=18)
txt(ax,5.5,0.35,'零思考 · 零试错 · 零微调',fontsize=11,color=G,fontweight='bold')
sv(f,'fig5-1-flow-comparison.png')

# === 图5-2 框选局部修改 ===
f,ax=plt.subplots(figsize=(10,4.5)); ax.set_xlim(0,10); ax.set_ylim(0,4.5); ax.axis('off')
rbox(ax,0.5,0.3,3.5,3.8,'#E8E8E8','#CCC',2); txt(ax,2.25,2.3,'🖼️',fontsize=40); txt(ax,2.25,0.6,'用户上传图片',fontsize=9,color=GR)
rbox(ax,1.0,1.5,1.5,1.2,'none',ec=A,lw=2.5,ls='--',r=0.02); txt(ax,1.75,2.85,'框选区域',fontsize=8,color=A,fontweight='bold')
arr(ax,4.2,2.2,4.8,2.2,D,2)
rbox(ax,5.0,2.5,4.2,1.2,LB,B,1.5); txt(ax,5.2,3.35,'💬 提示词',fontsize=9,color=B,fontweight='bold')
txt(ax,7.1,3.0,'"耳朵被头发遮住了，\n把头发弄开露出耳朵"',fontsize=9,color='#333')
arr(ax,7.1,2.5,7.1,1.9,B,2)
rbox(ax,5.0,0.4,4.2,1.2,'#E6F7EF',G,1.5); txt(ax,5.2,1.25,'✨ AI处理',fontsize=9,color=G,fontweight='bold')
txt(ax,7.1,0.9,'只修改框选区域\n其他部分保持不变',fontsize=9,color='#333')
sv(f,'fig5-2-selection-edit.png')

# === 图5-3 参考图学习 ===
f,ax=plt.subplots(figsize=(10,4)); ax.set_xlim(0,10); ax.set_ylim(0,4); ax.axis('off')
txt(ax,5,3.7,'参考图学习流程',fontsize=15,fontweight='bold',color=D)
# 待修图
rbox(ax,0.3,0.8,2.2,2.4,'#E8E8E8','#CCC',1.5); txt(ax,1.4,2.2,'📷',fontsize=30); txt(ax,1.4,1.2,'待修图',fontsize=10,color=D,fontweight='bold')
txt(ax,1.4,0.5,'原图（人物不变）',fontsize=8,color=GR)
# 加号
txt(ax,3.2,2.0,'+',fontsize=24,color=GR,fontweight='bold')
# 参考图
rbox(ax,4.0,0.8,2.2,2.4,'#FFF8E8','#E8A830',1.5); txt(ax,5.1,2.2,'🌟',fontsize=30); txt(ax,5.1,1.2,'参考图',fontsize=10,color='#B8860B',fontweight='bold')
txt(ax,5.1,0.5,'提取风格（光影/色调/妆容）',fontsize=8,color=GR)
# 箭头
arr(ax,6.4,2.0,7.0,2.0,G,3)
# 结果
rbox(ax,7.2,0.8,2.2,2.4,'#E6F7EF',G,2); txt(ax,8.3,2.2,'✨',fontsize=30); txt(ax,8.3,1.2,'效果图',fontsize=10,color=G,fontweight='bold')
txt(ax,8.3,0.5,'人物不变 + 风格迁移',fontsize=8,color=G)
sv(f,'fig5-3-reference-learning.png')

# === 图6-1 产品功能架构图 ===
f,ax=plt.subplots(figsize=(10,6)); ax.set_xlim(0,10); ax.set_ylim(0,6.5); ax.axis('off')
rbox(ax,3,5.8,4,0.6,D); txt(ax,5,6.1,'AI一键精修',fontsize=15,color='white',fontweight='bold')
# 连接线
ax.plot([5,5],[5.8,5.3],c=GR)
# 三大模块
modules=[(1.3,'核心功能',B,[('一键精修','P0'),('框选局部修改','P0'),('参考图学习','P1')]),
         (5.0,'辅助功能',L,[('基础调色','P2'),('抠图','P1'),('改字','P1')]),
         (8.7,'基础设施',GR,[('AI大模型接入',''),('微信小程序',''),('公众号支付','')])]
for cx,title,c,items in modules:
    ax.plot([cx,cx],[5.3,4.9],c=GR); ax.plot([1.3,8.7],[5.3,5.3],c=GR)
    rbox(ax,cx-1.1,4.3,2.2,0.55,c); txt(ax,cx,4.57,title,fontsize=11,color='white',fontweight='bold')
    for i,(name,tag) in enumerate(items):
        y=3.5-i*0.8; rbox(ax,cx-1.0,y,2.0,0.55,LB if c!=GR else '#F5F5F5',c,1)
        txt(ax,cx-0.3,y+0.27,name,fontsize=9,color=D)
        if tag:
            tag_color=G if tag=='P0' else (A if tag=='P1' else GR)
            rbox(ax,cx+0.55,y+0.1,0.5,0.35,tag_color,r=0.03); txt(ax,cx+0.8,y+0.27,tag,fontsize=7,color='white',fontweight='bold')
sv(f,'fig6-1-feature-architecture.png')

# === 图7-1 iOS激活码充值流程 ===
f,ax=plt.subplots(figsize=(10,5.5)); ax.set_xlim(0,10); ax.set_ylim(0,6); ax.axis('off')
txt(ax,5,5.7,'iOS激活码充值流程',fontsize=15,fontweight='bold',color=D)
steps=[('1','小程序内\n点击领取激活码',D),('2','弹出公众号\n二维码',B),('3','关注公众号\n输入"P图"',L),
       ('4','系统推送\nH5充值地址',L),('5','H5页面\n完成充值',A),('6','获取充值码\n回小程序激活',G)]
positions=[(1.2,4.0),(3.5,4.0),(5.8,4.0),(8.1,4.0),(3.5,1.8),(5.8,1.8)]
for i,((num,label,c),(x,y)) in enumerate(zip(steps,positions)):
    circle=plt.Circle((x,y+0.45),0.3,color=c); ax.add_patch(circle); txt(ax,x,y+0.45,num,fontsize=13,color='white',fontweight='bold')
    rbox(ax,x-0.9,y-0.6,1.8,0.85,LB,c,1); txt(ax,x,y-0.2,label,fontsize=8.5,color='#333')
# arrows
arr(ax,2.1,4.0,3.0,4.0,GR,1.5); arr(ax,4.4,4.0,5.3,4.0,GR,1.5); arr(ax,6.7,4.0,7.6,4.0,GR,1.5)
arr(ax,8.1,3.4,4.2,2.2,GR,1.5); arr(ax,4.4,1.8,5.3,1.8,GR,1.5)
# 标注
txt(ax,1.2,0.6,'小程序内',fontsize=8,color=GR,style='italic')
txt(ax,3.8,2.9,'公众号',fontsize=8,color=GR,style='italic')
txt(ax,8.1,3.1,'H5页面',fontsize=8,color=GR,style='italic')
sv(f,'fig7-1-ios-payment-flow.png')

# === 图8-1 用户心智占位示意图 ===
f,ax=plt.subplots(figsize=(10,4.5)); ax.set_xlim(0,10); ax.set_ylim(0,5); ax.axis('off')
txt(ax,5,4.7,'用户心智占领',fontsize=16,fontweight='bold',color=D)
# 竞品
rbox(ax,0.5,2.5,3.5,1.8,'#F5F5F5',GR,1.5); txt(ax,2.25,3.8,'传统修图App',fontsize=12,color=GR,fontweight='bold')
txt(ax,2.25,3.2,'需要学习·反复试错\n等待时间长·操作复杂',fontsize=9,color='#666')
# 我们
rbox(ax,6.0,2.0,3.5,2.5,'#E6F7EF',G,2.5); txt(ax,7.75,3.9,'AI一键精修',fontsize=14,color=G,fontweight='bold')
txt(ax,7.75,3.2,'一键P图·一键生图\n立马达到想要的效果',fontsize=10,color=G,fontweight='bold')
txt(ax,7.75,2.5,'丢图即出片 ✨',fontsize=9,color='#666')
# 对比箭头
ax.annotate('',xy=(6.0,3.25),xytext=(4.0,3.25),arrowprops=dict(arrowstyle='->',color=A,lw=3))
txt(ax,5,3.7,'差异化',fontsize=10,color=A,fontweight='bold')
# 底部时间轴
ax.plot([1,9],[1.2,1.2],c=D,lw=2)
for x,label,active in [(2,'上线',True),(4,'种子用户',True),(6,'口碑传播',True),(8,'心智占领',True)]:
    ax.plot(x,1.2,'o',color=G if active else GR,markersize=10)
    txt(ax,x,0.7,label,fontsize=9,color=D if active else GR,fontweight='bold')
txt(ax,5,0.2,'时间窗口有限，必须快速行动',fontsize=9,color=A,fontweight='bold',style='italic')
sv(f,'fig8-1-mind-positioning.png')

print('\n全部图表生成完成！')
