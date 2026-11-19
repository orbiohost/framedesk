// Lets other parts of the app (the AI chat) add a note to a board that is open
// in the editor right now. The editor holds the live canvas, so the note goes
// straight into it (and is saved with it) instead of racing a server write.

const openBoards = new Map();

// Called by the board editor; returns the cleanup for its effect.
export function registerOpenBoard(boardId, addNote) {
  openBoards.set(boardId, addNote);
  return () => {
    if (openBoards.get(boardId) === addNote) openBoards.delete(boardId);
  };
}

// The open editor's adder for this board, or undefined.
export function openBoardAdder(boardId) {
  return openBoards.get(boardId);
}
