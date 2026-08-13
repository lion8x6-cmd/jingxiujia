Component({
  properties: {
    beforeSrc: { type: String, value: '' },
    afterSrc: { type: String, value: '' },
    initialPos: { type: Number, value: 50 }
  },

  data: {
    sliderPos: 50,
    containerWidth: 0,
    dragging: false
  },

  lifetimes: {
    attached() {
      this.setData({ sliderPos: this.data.initialPos });
    },
    ready() {
      this.measureWidth();
    }
  },

  methods: {
    measureWidth() {
      const query = this.createSelectorQuery();
      query.select('.compare-container').boundingClientRect((rect) => {
        if (rect) {
          this.setData({ containerWidth: rect.width });
        }
      }).exec();
    },

    onTouchStart(e) {
      this.setData({ dragging: true });
      this.updatePos(e.touches[0].clientX);
    },

    onTouchMove(e) {
      if (!this.data.dragging) return;
      this.updatePos(e.touches[0].clientX);
    },

    onTouchEnd() {
      this.setData({ dragging: false });
    },

    updatePos(clientX) {
      const query = this.createSelectorQuery();
      query.select('.compare-container').boundingClientRect((rect) => {
        if (!rect) return;
        let pos = ((clientX - rect.left) / rect.width) * 100;
        pos = Math.max(0, Math.min(100, pos));
        this.setData({ sliderPos: pos });
        this.triggerEvent('change', { pos });
      }).exec();
    }
  }
});
