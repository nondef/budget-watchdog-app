import { IAppSettingsRepository } from '@/domain/interfaces/app-settings-repository.interface';
import { Language } from '@/domain/value-objects/language';
import { StateNotInitializedException } from '@/domain/exceptions/domain.exception';
import { AppDTO } from "@/application";
import { AppMapper } from "@/application/mappers/app.mapper";
import { IUnitOfWork } from '@/domain';

export interface UpdateLanguageInput {
    language: Language;
}

export class UpdateLanguageUseCase {
    constructor(
        private appSettingsRepository: IAppSettingsRepository,
        private unitOfWork: IUnitOfWork
    ) {}

    async execute(input: UpdateLanguageInput): Promise<AppDTO> {
        return this.unitOfWork.run(async () => {
            const settings = await this.appSettingsRepository.get();
            if (!settings) throw new StateNotInitializedException('AppSettings');

            settings.changeLanguage(input.language);
            await this.appSettingsRepository.save(settings);
            return AppMapper.toDTO(settings)
        })
    }
}
