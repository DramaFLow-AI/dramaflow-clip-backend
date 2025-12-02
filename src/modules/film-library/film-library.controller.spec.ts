import { Test, TestingModule } from '@nestjs/testing';
import { FilmLibraryController } from './film-library.controller';
import { FilmLibraryService } from './film-library.service';

describe('FilmLibraryController', () => {
  let controller: FilmLibraryController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FilmLibraryController],
      providers: [FilmLibraryService],
    }).compile();

    controller = module.get<FilmLibraryController>(FilmLibraryController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
