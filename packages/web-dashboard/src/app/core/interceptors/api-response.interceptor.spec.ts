import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { apiResponseInterceptor } from './api-response.interceptor';

describe('apiResponseInterceptor', () => {
  let httpClient: HttpClient;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([apiResponseInterceptor])),
        provideHttpClientTesting()
      ]
    });

    httpClient = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('response unwrapping', () => {
    it('should unwrap response with success and data fields containing object', () => {
      // Arrange
      const testData = { id: '123', name: 'Test' };
      const apiResponse = { success: true, data: testData };

      // Act
      let receivedData: unknown;
      httpClient.get('/api/test').subscribe(data => {
        receivedData = data;
      });

      const req = httpMock.expectOne('/api/test');
      req.flush(apiResponse);

      // Assert
      expect(receivedData).toEqual(testData);
    });

    it('should unwrap response with success and data fields containing array', () => {
      // Arrange
      const testData = [{ id: '1' }, { id: '2' }];
      const apiResponse = { success: true, data: testData };

      // Act
      let receivedData: unknown;
      httpClient.get('/api/items').subscribe(data => {
        receivedData = data;
      });

      const req = httpMock.expectOne('/api/items');
      req.flush(apiResponse);

      // Assert
      expect(receivedData).toEqual(testData);
    });

    it('should unwrap response with success and data fields containing primitive value', () => {
      // Arrange
      const testData = 'test-string';
      const apiResponse = { success: true, data: testData };

      // Act
      let receivedData: unknown;
      httpClient.get('/api/value').subscribe(data => {
        receivedData = data;
      });

      const req = httpMock.expectOne('/api/value');
      req.flush(apiResponse);

      // Assert
      expect(receivedData).toBe(testData);
    });

    it('should unwrap response with success and data fields containing null', () => {
      // Arrange
      const apiResponse = { success: true, data: null };

      // Act
      let receivedData: unknown;
      httpClient.get('/api/null').subscribe(data => {
        receivedData = data;
      });

      const req = httpMock.expectOne('/api/null');
      req.flush(apiResponse);

      // Assert
      expect(receivedData).toBeNull();
    });

    it('should unwrap response when success is false', () => {
      // Arrange
      const testData = { error: 'Something went wrong' };
      const apiResponse = { success: false, data: testData };

      // Act
      let receivedData: unknown;
      httpClient.get('/api/error').subscribe(data => {
        receivedData = data;
      });

      const req = httpMock.expectOne('/api/error');
      req.flush(apiResponse);

      // Assert
      expect(receivedData).toEqual(testData);
    });
  });

  describe('passthrough behavior', () => {
    it('should not modify response without success and data fields', () => {
      // Arrange
      const rawResponse = { id: '123', value: 'test' };

      // Act
      let receivedData: unknown;
      httpClient.get('/api/raw').subscribe(data => {
        receivedData = data;
      });

      const req = httpMock.expectOne('/api/raw');
      req.flush(rawResponse);

      // Assert
      expect(receivedData).toEqual(rawResponse);
    });

    it('should not modify response with only success field', () => {
      // Arrange
      const rawResponse = { success: true };

      // Act
      let receivedData: unknown;
      httpClient.get('/api/success-only').subscribe(data => {
        receivedData = data;
      });

      const req = httpMock.expectOne('/api/success-only');
      req.flush(rawResponse);

      // Assert
      expect(receivedData).toEqual(rawResponse);
    });

    it('should not modify response with only data field', () => {
      // Arrange
      const rawResponse = { data: 'test-data' };

      // Act
      let receivedData: unknown;
      httpClient.get('/api/data-only').subscribe(data => {
        receivedData = data;
      });

      const req = httpMock.expectOne('/api/data-only');
      req.flush(rawResponse);

      // Assert
      expect(receivedData).toEqual(rawResponse);
    });

    it('should not modify response with null body', () => {
      // Arrange & Act
      let receivedData: unknown;
      httpClient.get('/api/null-body').subscribe(data => {
        receivedData = data;
      });

      const req = httpMock.expectOne('/api/null-body');
      req.flush(null);

      // Assert
      expect(receivedData).toBeNull();
    });

    it('should not modify response with primitive body', () => {
      // Arrange
      const primitiveResponse = 'plain-string';

      // Act
      let receivedData: unknown;
      httpClient.get('/api/primitive').subscribe(data => {
        receivedData = data;
      });

      const req = httpMock.expectOne('/api/primitive');
      req.flush(primitiveResponse);

      // Assert
      expect(receivedData).toBe(primitiveResponse);
    });

    it('should not modify response with array body', () => {
      // Arrange
      const arrayResponse = ['item1', 'item2'];

      // Act
      let receivedData: unknown;
      httpClient.get('/api/array').subscribe(data => {
        receivedData = data;
      });

      const req = httpMock.expectOne('/api/array');
      req.flush(arrayResponse);

      // Assert
      expect(receivedData).toEqual(arrayResponse);
    });
  });

  describe('edge cases', () => {
    it('should handle response with nested success and data fields', () => {
      // Arrange
      const testData = { nested: { success: true, data: 'inner' } };
      const apiResponse = { success: true, data: testData };

      // Act
      let receivedData: unknown;
      httpClient.get('/api/nested').subscribe(data => {
        receivedData = data;
      });

      const req = httpMock.expectOne('/api/nested');
      req.flush(apiResponse);

      // Assert
      expect(receivedData).toEqual(testData);
    });

    it('should handle response with extra fields alongside success and data', () => {
      // Arrange
      const testData = { value: 'test' };
      const apiResponse = { success: true, data: testData, timestamp: '2024-01-01' };

      // Act
      let receivedData: unknown;
      httpClient.get('/api/extra-fields').subscribe(data => {
        receivedData = data;
      });

      const req = httpMock.expectOne('/api/extra-fields');
      req.flush(apiResponse);

      // Assert
      expect(receivedData).toEqual(testData);
    });

    it('should handle multiple sequential requests correctly', () => {
      // Arrange
      const data1 = { id: '1' };
      const data2 = { id: '2' };
      const response1 = { success: true, data: data1 };
      const response2 = { success: true, data: data2 };

      // Act
      let receivedData1: unknown;
      let receivedData2: unknown;

      httpClient.get('/api/first').subscribe(data => {
        receivedData1 = data;
      });

      httpClient.get('/api/second').subscribe(data => {
        receivedData2 = data;
      });

      const req1 = httpMock.expectOne('/api/first');
      const req2 = httpMock.expectOne('/api/second');

      req1.flush(response1);
      req2.flush(response2);

      // Assert
      expect(receivedData1).toEqual(data1);
      expect(receivedData2).toEqual(data2);
    });
  });
});
