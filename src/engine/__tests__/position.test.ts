import { describe, expect, it } from 'vitest';
import { boardFromString, boardToString, parseSquare, squareName } from '../board';
import { Position, isAttacked, moveToSAN } from '../position';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR';

function perft(pos: Position, depth: number): number {
  if (depth === 0) return 1;
  const moves = pos.legalMoves();
  if (depth === 1) return moves.length;
  let n = 0;
  for (const m of moves) {
    pos.makeMove(m);
    n += perft(pos, depth - 1);
    pos.unmakeMove();
  }
  return n;
}

describe('board helpers', () => {
  it('round-trips a placement string', () => {
    expect(boardToString(boardFromString(START))).toBe(START);
  });
  it('names squares', () => {
    expect(squareName(0)).toBe('a1');
    expect(squareName(63)).toBe('h8');
    expect(parseSquare('e4')).toBe(28);
  });
});

describe('standard chess move generation (single king, no castling)', () => {
  it('matches perft for the initial position', () => {
    const pos = new Position(boardFromString(START));
    expect(perft(pos, 1)).toBe(20);
    expect(perft(pos, 2)).toBe(400);
    expect(perft(pos, 3)).toBe(8902);
  });

  it('handles en passant and promotion', () => {
    // White pawn e5, black pawn d7 about to double push.
    const pos = new Position(boardFromString('k7/3p4/8/4P3/8/8/8/K7'), 'b');
    const push = pos.legalMoves().find((m) => m.from === parseSquare('d7') && m.to === parseSquare('d5'))!;
    expect(push.doublePush).toBe(true);
    pos.makeMove(push);
    const ep = pos.legalMoves().find((m) => m.enPassant)!;
    expect(ep).toBeDefined();
    expect(squareName(ep.to)).toBe('d6');
    pos.makeMove(ep);
    expect(pos.board[parseSquare('d5')]).toBeNull();
    pos.unmakeMove();
    expect(pos.board[parseSquare('d5')]?.type).toBe('p');

    const promo = new Position(boardFromString('8/P7/8/8/8/8/8/k6K'), 'w');
    const promos = promo.legalMoves().filter((m) => m.promotion);
    expect(promos.map((m) => m.promotion).sort()).toEqual(['b', 'n', 'q', 'r']);
  });

  it('never captures a king', () => {
    // Black king on e8 is attacked by the rook on e1 but cannot be taken.
    const pos = new Position(boardFromString('4k3/8/8/8/8/8/8/4R2K'), 'w');
    expect(pos.legalMoves().some((m) => m.to === parseSquare('e8'))).toBe(false);
    expect(isAttacked(pos.board, parseSquare('e8'), 'w')).toBe(true);
  });
});

describe('two-king rules', () => {
  it('allows leaving one king in check but not both', () => {
    // White kings a1 and h1; black rook on a8 checks the a1 king. Black king h8.
    const pos = new Position(boardFromString('r6k/8/8/8/8/8/8/K6K'), 'w');
    const moves = pos.legalMoves();
    // Moving the h1 king (leaving a1 in check) is legal.
    expect(moves.some((m) => m.from === parseSquare('h1'))).toBe(true);
    // But the h1 king may not step onto the a-file... it can't reach it. Instead: a1 king moving
    // to b1 leaves the a-file check, fine; every move must keep at least one king safe.
    for (const m of moves) {
      expect(m.checkedAfter.length).toBeLessThan(2);
    }
    expect(pos.result().kind).toBe('ongoing');
  });

  it('rejects moves that put both kings in check', () => {
    // White kings a2 (in check from the rook on a8) and b2. A black rook on h1 sweeps rank 1.
    const pos = new Position(boardFromString('r6k/8/8/8/8/8/KK6/7r'), 'w');
    const moves = pos.legalMoves();
    // b2 -> b1 would put the second king on the rook's rank: both in check, illegal.
    expect(moves.find((m) => m.from === parseSquare('b2') && m.to === parseSquare('b1'))).toBeUndefined();
    expect(moves.find((m) => m.from === parseSquare('b2') && m.to === parseSquare('a1'))).toBeUndefined();
    // b2 -> c2 keeps b2's king safe, so it is fine even though a2 stays in check.
    expect(moves.find((m) => m.from === parseSquare('b2') && m.to === parseSquare('c2'))).toBeDefined();
    // a2 -> a1 walks the checked king into a different check, but b2 is safe: legal.
    const walk = moves.find((m) => m.from === parseSquare('a2') && m.to === parseSquare('a1'));
    expect(walk).toBeDefined();
    expect(walk!.checkedAfter.map(squareName)).toEqual(['a2']);
  });

  it('declares a loss when both kings are in check at the start of the turn', () => {
    // Black kings a8 and c8, white rooks a1 and c1.
    const pos = new Position(boardFromString('k1k5/8/8/8/8/8/8/R1R1K3'), 'b');
    const res = pos.result();
    expect(res.kind).toBe('both-in-check');
    if (res.kind === 'both-in-check') expect(res.winner).toBe('w');
  });

  it('declares checkmate when one king cannot escape even though the other is free', () => {
    // Black king a8 boxed in by white queen b7 (protected by king c6); other black king h1
    // is free to move. Under two-king rules this is still a loss: a8 is mated.
    const pos = new Position(boardFromString('k7/1Q6/2K5/8/8/8/8/7k'), 'b');
    const res = pos.result();
    expect(res.kind).toBe('checkmate');
    if (res.kind === 'checkmate') {
      expect(res.winner).toBe('w');
      expect(squareName(res.king)).toBe('a8');
    }
  });

  it('is not mate when the checked king can be rescued by the other king', () => {
    // Black king a8 attacked by queen b7 (defended by white king c6). If black's second king
    // sat on a6 it could capture... kings cannot be captured. Instead put a black rook on
    // h7 so it can take the queen.
    const pos = new Position(boardFromString('k7/1Q5r/2K5/8/8/8/8/7k'), 'b');
    const res = pos.result();
    expect(res.kind).toBe('ongoing');
    if (res.kind === 'ongoing') expect(res.checkedKings.map(squareName)).toEqual(['a8']);
  });

  it('a king may walk next to an enemy king (checking it) when its partner is safe', () => {
    const pos = new Position(boardFromString('8/8/8/8/8/7K/8/K1k3k1'), 'w');
    // White king a1 -> b2 is adjacent to black king c1: it gives check and receives check.
    const m = pos.legalMoves().find((x) => x.from === parseSquare('a1') && x.to === parseSquare('b2'));
    expect(m).toBeDefined();
    expect(m!.checkedAfter.map(squareName)).toEqual(['a1']);
  });

  it('a boxed-in king may still step into check while its partner is safe', () => {
    // Black kings a8 and h1 are hemmed in by queens, but neither is in check, so walking
    // into check is legal under two-king rules: this is NOT stalemate.
    const pos = new Position(boardFromString('k7/8/1Q6/4K3/8/6Q1/8/7k'), 'b');
    expect(pos.legalMoves().length).toBeGreaterThan(0);
    expect(pos.result().kind).toBe('ongoing');
  });

  it('stalemate requires no checks and no moves at all', () => {
    // A lone king (degenerate single-king army) boxed in by a queen.
    const pos = new Position(boardFromString('k7/2Q5/8/8/8/8/8/K7'), 'b');
    expect(pos.legalMoves()).toHaveLength(0);
    expect(pos.result().kind).toBe('stalemate');
  });

  it('a checked king with no moves at all is checkmate, not stalemate', () => {
    const pos = new Position(boardFromString('k7/1Q6/2K5/8/8/8/8/8'), 'b');
    expect(pos.legalMoves()).toHaveLength(0);
    expect(pos.result().kind).toBe('checkmate');
  });

  it('applies the fifty-move rule and threefold repetition', () => {
    const pos = new Position(boardFromString('k6k/8/8/8/8/8/8/K6K'), 'w');
    pos.halfmove = 100;
    expect(pos.result().kind).toBe('fifty-move');
    pos.halfmove = 0;
    const shuffle = (from: string, to: string) => {
      const m = pos.legalMoves().find((x) => x.from === parseSquare(from) && x.to === parseSquare(to))!;
      pos.makeMove(m);
    };
    for (let i = 0; i < 2; i++) {
      shuffle('a1', 'a2');
      shuffle('a8', 'a7');
      shuffle('a2', 'a1');
      shuffle('a7', 'a8');
    }
    expect(pos.repetitionCount()).toBe(3);
    expect(pos.result().kind).toBe('repetition');
  });

  it('formats SAN-ish move text', () => {
    expect(moveToSAN({ from: parseSquare('e2'), to: parseSquare('e4'), piece: 'p' })).toBe('e4');
    expect(moveToSAN({ from: parseSquare('g1'), to: parseSquare('f3'), piece: 'n' })).toBe('Ng1f3');
    expect(moveToSAN({ from: parseSquare('e4'), to: parseSquare('d5'), piece: 'p', captured: 'p' })).toBe('exd5');
  });
});

describe('hashing', () => {
  it('keeps the incremental hash in sync with a full recompute', async () => {
    const { hashPosition } = await import('../position');
    const { generateSetup } = await import('../setup');
    for (let seed = 1; seed <= 20; seed++) {
      const pos = new Position(generateSetup({ mode: 'chaos', seed }).board);
      for (let ply = 0; ply < 30; ply++) {
        const moves = pos.legalMoves();
        if (moves.length === 0 || pos.result().kind !== 'ongoing') break;
        const m = moves[(seed * 7 + ply * 13) % moves.length];
        pos.makeMove(m);
        expect(pos.hash).toBe(hashPosition(pos.board, pos.turn, pos.ep));
      }
      while (pos.moveCount > 0) pos.unmakeMove();
      expect(pos.hash).toBe(hashPosition(pos.board, pos.turn, pos.ep));
    }
  });
});
