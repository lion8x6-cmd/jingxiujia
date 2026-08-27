#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.patches import FancyBboxPatch
import os

plt.rcParams['font.family'] = 'Heiti SC'
plt.rcParams['axes.unicode_minus'] = False

OUT = '/Users/mr.baihe/WorkBuddy/P 图修图-精修家/output/mrd-20260814/stage2/images'
os.makedirs(OUT, exist_ok=True)

C_DARK='#1A3C6E'; C_BLUE='#2C5FA0'; C_LIGHT='#3A7AC4'
C_ACCENT='#E8734A'; C_GREEN='#2E9E6B'; C_GRAY='#888888'
C_LB='#E8F0FE'; C_GRAYBG='#F0F0F0'

def save(fig, name):
    fig.savefig(os.path.join(OUT, name), dpi=200, bbox_inches='tight', facecolor='white')
    plt.close(fig)
    print(f'  ok: {name}')
