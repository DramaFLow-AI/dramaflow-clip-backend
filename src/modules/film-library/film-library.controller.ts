import { Controller, Get, Body, Param, Delete } from '@nestjs/common';
import { FilmLibraryService } from './film-library.service';

@Controller('film-library')
export class FilmLibraryController {
  constructor(private readonly filmLibraryService: FilmLibraryService) {}

  @Get()
  findAll() {
    return this.filmLibraryService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.filmLibraryService.findOne(+id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.filmLibraryService.remove(+id);
  }
}
