const platform = require('../../utils/platform.js');
Component({
  properties: {
    percent: { type: Number, value: 0 },
    size: { type: Number, value: 200 },
    strokeWidth: { type: Number, value: 12 },
    color: { type: String, value: '#FE2C55' },
    bgColor: { type: String, value: '#E1F5EE' },
    label: { type: String, value: '' }
  },

  observers: {
    'percent': function (val) {
      this.drawRing(val);
    }
  },

  lifetimes: {
    attached() {
      this.drawRing(this.data.percent);
    }
  },

  methods: {
    drawRing(percent) {
      const query = this.createSelectorQuery();
      query.select('#ringCanvas')
        .fields({ node: true, size: true })
        .exec((res) => {
          if (!res[0]) return;
          const canvas = res[0].node;
          if (!canvas) return;
          const ctx = canvas.getContext('2d');
          const dpr = platform.getSystemInfoSync().pixelRatio;
          const size = this.data.size;
          canvas.width = size * dpr;
          canvas.height = size * dpr;
          ctx.scale(dpr, dpr);

          const center = size / 2;
          const radius = center - this.data.strokeWidth;
          const startAngle = -Math.PI / 2;
          const endAngle = startAngle + (Math.PI * 2 * percent / 100);

          ctx.clearRect(0, 0, size, size);
          ctx.beginPath();
          ctx.arc(center, center, radius, 0, Math.PI * 2);
          ctx.strokeStyle = this.data.bgColor;
          ctx.lineWidth = this.data.strokeWidth;
          ctx.lineCap = 'round';
          ctx.stroke();

          if (percent > 0) {
            ctx.beginPath();
            ctx.arc(center, center, radius, startAngle, endAngle);
            ctx.strokeStyle = this.data.color;
            ctx.lineWidth = this.data.strokeWidth;
            ctx.lineCap = 'round';
            ctx.stroke();
          }
        });
    }
  }
});
