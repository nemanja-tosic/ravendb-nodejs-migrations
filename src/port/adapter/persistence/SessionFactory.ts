import {
  CreateDatabaseOperation,
  DocumentConventions,
  DocumentStore,
  GetStatisticsOperation,
  IDocumentSession,
  IDocumentStore,
} from 'ravendb';

import ISessionFactory from '../../../domain/ISessionFactory';
import ConfigProvider from '../config/ConfigProvider';

export default class SessionFactory implements ISessionFactory {
  public static Instance = new SessionFactory();

  async createSession<T>(
    cb: (session: IDocumentSession) => Promise<T>
  ): Promise<T> {
    const {
      database: { url, name, authOptions },
      conventions,
    } = ConfigProvider.Instance.config;

    const store = new DocumentStore(url, name, authOptions as any);
    store.conventions = Object.assign(new DocumentConventions(), conventions);
    store.initialize();

    await this.ensureDatabaseExists(store, name);

    const session = store.openSession();
    try {
      const result = await cb(session);
      await session.saveChanges();
      return result;
    } finally {
      session.dispose();
      store.dispose();
    }
  }

  private async ensureDatabaseExists(
    store: IDocumentStore,
    database: string,
    createDatabaseIfNotExists = true
  ) {
    if (!database) {
      throw new Error('A database name must be provided');
    }

    return await store.maintenance
      .forDatabase(database)
      .send(new GetStatisticsOperation())
      .catch((error) => {
        if (
          error.name !== 'DatabaseDoesNotExistException' ||
          !createDatabaseIfNotExists
        ) {
          throw error;
        }

        return store.maintenance.server.send(
          new CreateDatabaseOperation({
            databaseName: database,
          })
        );
      })
      .catch((error) => {
        if (error.name === 'ConcurrencyException') {
          // already created, all good
          return;
        }

        throw error;
      });
  }
}
