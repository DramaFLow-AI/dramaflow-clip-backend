import { Injectable } from '@nestjs/common';

@Injectable()
export class FilmLibraryService {
  findAll() {
    return `This action returns all filmLibrary`;
  }

  findOne(id: number) {
    return `This action returns a #${id} filmLibrary`;
  }

  remove(id: number) {
    return `This action removes a #${id} filmLibrary`;
  }
}
