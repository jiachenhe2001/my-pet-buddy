function placeAssistant(anchor, area, preferred = { width: 400, height: 650 }) {
  const width = Math.max(1, Math.min(preferred.width, area.width - 16));
  const above = Math.max(0, anchor.y - area.y - 4), below = Math.max(0, area.y + area.height - anchor.y - anchor.height - 4);
  const placement = above >= below ? 'above' : 'below';
  const height = Math.max(1, Math.min(preferred.height, Math.max(420, placement === 'above' ? above : below), area.height - 16));
  const center = anchor.x + anchor.width / 2;
  const x = Math.round(Math.max(area.x + 8, Math.min(center - width / 2, area.x + area.width - width - 8)));
  const rawY = placement === 'above' ? anchor.y - height + 4 : anchor.y + anchor.height - 4;
  const y = Math.round(Math.max(area.y + 8, Math.min(rawY, area.y + area.height - height - 8)));
  return { x, y, width, height, placement, tailX: Math.max(25, Math.min(width - 25, center - x)) };
}
module.exports = { placeAssistant };
