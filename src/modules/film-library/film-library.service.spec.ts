import { Test, TestingModule } from '@nestjs/testing';
import { FilmLibraryService } from './film-library.service';

describe('FilmLibraryService', () => {
  let service: FilmLibraryService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [FilmLibraryService],
    }).compile();

    service = module.get<FilmLibraryService>(FilmLibraryService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
