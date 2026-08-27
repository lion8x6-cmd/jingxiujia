const platform = require('../../utils/platform.js');
const { SKILLS } = require('../../utils/lab-skills');

Page({
  data: {
    skills: []
  },

  onLoad() {
    this.setData({
      skills: SKILLS.map(s => ({
        id: s.id,
        name: s.name,
        icon: s.icon,
        color: s.color,
        description: s.description
      }))
    });
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 3 });
    }
  },

  onSkillTap(e) {
    const id = e.currentTarget.dataset.id;
    platform.navigateTo({
      url: '/pages/lab/runner?skillId=' + id
    });
  }
});
