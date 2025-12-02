import { Module } from '@nestjs/common';
import { FilmLibraryService } from './film-library.service';
import { FilmLibraryController } from './film-library.controller';

@Module({
  controllers: [FilmLibraryController],
  providers: [FilmLibraryService],
})
export class FilmLibraryModule {}
