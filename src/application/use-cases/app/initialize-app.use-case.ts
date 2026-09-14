import { IAppSettingsRepository } from '@/domain/interfaces/app-settings-repository.interface';
import { AppMapper } from "@/application/mappers/app.mapper";
import { AppDTO } from "@/application";

export class InitializeAppUseCase {
    constructor(
        private appSettingsRepository: IAppSettingsRepository
    ) {}

    async execute(): Promise<AppDTO | null> {
        const settings = await this.appSettingsRepository.get()

        return settings ? AppMapper.toDTO(settings) : null
    }
}
