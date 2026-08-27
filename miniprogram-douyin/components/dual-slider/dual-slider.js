Component({
  properties: {
    value: {
      type: Number,
      value: 0
    },
    min: {
      type: Number,
      value: -100
    },
    max: {
      type: Number,
      value: 100
    },
    showValue: {
      type: Boolean,
      value: true
    },
    disabled: {
      type: Boolean,
      value: false
    }
  },

  data: {
    thumbLeft: 50,
    negativeWidth: 0,
    positiveWidth: 0
  },

  observers: {
    'value': function (val) {
      this.updatePosition(val);
    }
  },

  lifetimes: {
    attached() {
      this.updatePosition(this.data.value);
    }
  },

  methods: {
    updatePosition(value) {
      const range = this.data.max - this.data.min;
      const percent = ((value - this.data.min) / range) * 100;
      this.setData({
        thumbLeft: percent,
        negativeWidth: value < 0 ? Math.abs(value) / Math.abs(this.data.min) * 50 : 0,
        positiveWidth: value > 0 ? value / this.data.max * 50 : 0
      });
    },

    onTouchStart(e) {
      if (this.data.disabled) return;
      this._dragging = true;
      this._startX = e.touches[0].clientX;
      this._startValue = this.data.value;
    },

    onTouchMove(e) {
      if (!this._dragging || this.data.disabled) return;
      const query = this.createSelectorQuery();
      query.select('.slider-track').boundingClientRect((rect) => {
        if (!rect) return;
        const deltaX = e.touches[0].clientX - rect.left;
        const percent = Math.max(0, Math.min(1, deltaX / rect.width));
        const range = this.data.max - this.data.min;
        let newValue = Math.round(this.data.min + percent * range);
        if (Math.abs(newValue) < 3) newValue = 0;
        if (newValue !== this.data.value) {
          this.setData({ value: newValue });
          this.triggerEvent('change', { value: newValue });
        }
      }).exec();
    },

    onTouchEnd() {
      if (!this._dragging) return;
      this._dragging = false;
      this.triggerEvent('afterchange', { value: this.data.value });
    },

    onTrackTap(e) {
      if (this.data.disabled) return;
      const query = this.createSelectorQuery();
      query.select('.slider-track').boundingClientRect((rect) => {
        if (!rect) return;
        const percent = (e.detail.x - rect.left) / rect.width;
        const range = this.data.max - this.data.min;
        let newValue = Math.round(this.data.min + percent * range);
        if (Math.abs(newValue) < 5) newValue = 0;
        this.setData({ value: newValue });
        this.triggerEvent('change', { value: newValue });
        this.triggerEvent('afterchange', { value: newValue });
      }).exec();
    }
  }
});
