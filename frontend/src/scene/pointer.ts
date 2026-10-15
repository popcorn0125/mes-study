/** 클릭 가능한 3D 객체 위에서 커서를 손가락 모양으로 바꾼다. */
export const hoverCursor = {
  enter: () => {
    document.body.style.cursor = 'pointer'
  },
  leave: () => {
    document.body.style.cursor = ''
  },
}
