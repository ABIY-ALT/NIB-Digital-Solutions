import { describe, expect, it } from 'vitest';
import type { TransactionManager } from '#core/application/ports/transaction.port.js';
import type { Principal } from '#core/application/security/principal.js';
import { ValidationError } from '#core/domain/errors/app-error.js';
import { HeroSlide } from '../domain/hero-slide.entity.js';
import type { HeroSlideRepository } from '../domain/hero-slide.repository.js';
import { CreateHeroSlideUseCase, ReorderHeroSlidesUseCase } from './hero-slide.use-cases.js';

const IMAGE = '0190f3a2-7b1c-7d2e-8f3a-1b2c3d4e5f60';
const principal = { userId: 'editor' } as Principal;
const tx: TransactionManager = { run: (fn) => fn() };

/** In-memory repository: just enough for the use cases under test. */
function fakeRepo(slides: HeroSlide[], knownMedia = [IMAGE]) {
  const writes: string[] = [];
  const repo = {
    findOrdered: () =>
      Promise.resolve([...slides].sort((a, b) => (a.sortOrder ?? 1e9) - (b.sortOrder ?? 1e9))),
    missingMedia: (ids: readonly string[]) =>
      Promise.resolve(ids.filter((id) => !knownMedia.includes(id))),
    update: (s: HeroSlide) => {
      writes.push(s.id);
      return Promise.resolve(s);
    },
    save: (s: HeroSlide) => {
      slides.push(s);
      return Promise.resolve(s);
    },
  } as unknown as HeroSlideRepository;
  return { repo, writes };
}

const slide = (sortOrder: number) =>
  HeroSlide.create({ desktopImageId: IMAGE, sortOrder, active: true }, 'maker');

describe('ReorderHeroSlidesUseCase', () => {
  it('sets positions 0, 1, 2… and writes only the slides that moved', async () => {
    const [a, b, c] = [slide(0), slide(1), slide(2)];
    const { repo, writes } = fakeRepo([a, b, c]);
    const result = await new ReorderHeroSlidesUseCase(repo, tx).execute({
      principal,
      ids: [c.id, b.id, a.id],
    });
    expect(result.map((s) => s.id)).toEqual([c.id, b.id, a.id]);
    expect(result.map((s) => s.sortOrder)).toEqual([0, 1, 2]);
    expect(writes).toEqual([c.id, a.id]); // b stayed at position 1
  });

  it('refuses a list that does not match the current slides', async () => {
    const [a, b] = [slide(0), slide(1)];
    const { repo } = fakeRepo([a, b]);
    const use = new ReorderHeroSlidesUseCase(repo, tx);
    await expect(use.execute({ principal, ids: [a.id] })).rejects.toBeInstanceOf(ValidationError);
    await expect(use.execute({ principal, ids: [a.id, a.id] })).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(
      use.execute({ principal, ids: [a.id, '0190f3a2-0000-7000-8000-000000000000'] }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('CreateHeroSlideUseCase', () => {
  it('puts a new slide last', async () => {
    const { repo } = fakeRepo([slide(0), slide(3)]);
    const created = await new CreateHeroSlideUseCase(repo, tx).execute({
      principal,
      desktopImageId: IMAGE,
    });
    expect(created.sortOrder).toBe(4);
  });

  it('refuses an image that was never uploaded', async () => {
    const { repo } = fakeRepo([], []);
    await expect(
      new CreateHeroSlideUseCase(repo, tx).execute({ principal, desktopImageId: IMAGE }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
