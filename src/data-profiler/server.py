import os
import pandas as pd
import numpy as np
from mcp.server.fastmcp import FastMCP

# Sunucumuzu tanımlıyoruz
mcp = FastMCP("Advanced Data Profiler")

@mcp.tool()
def analyze_data_quality(file_path: str) -> str:
    """
    Verilen bir CSV dosyasının kalitesini, eksik verilerini, 
    veri tiplerini ve satır/sütun özetlerini analiz eder.
    """
    if not os.path.exists(file_path):
        return f"Hata: '{file_path}' yolunda bir dosya bulunamadı."
    
    try:
        df = pd.read_csv(file_path)
        total_rows = len(df)
        total_cols = len(df.columns)
        
        # Eksik veri analizi
        missing_counts = df.isnull().sum()
        missing_summary = []
        for col, count in missing_counts.items():
            if int(count) > 0:
                percentage = (int(count) / total_rows) * 100
                missing_summary.append(f"  - {col}: {count} eksik değer (%{percentage:.2f})")
        
        missing_text = "\n".join(missing_summary) if missing_summary else "  - Eksik veya kayıp değer bulunamadı."
        dtypes_summary = [f"  - {col}: {dtype}" for col, dtype in df.dtypes.items()]
        dtypes_text = "\n".join(dtypes_summary)

        report = (
            f"📊 **Veri Seti Kalite Raporu** 📊\n"
            f"---------------------------------\n"
            f"🔹 **Genel Bilgiler:**\n"
            f"  - Toplam Satır Sayısı: {total_rows}\n"
            f"  - Toplam Sütun Sayısı: {total_cols}\n\n"
            f"🔹 **Veri Tipleri:**\n{dtypes_text}\n\n"
            f"🔹 **Eksik/Kayıp Değer Analizi:**\n{missing_text}\n"
            f"---------------------------------"
        )
        return report
    except Exception as e:
        return f"Dosya okunurken bir hata oluştu: {str(e)}"


@mcp.tool()
def find_outliers_iqr(file_path: str, column_name: str) -> str:
    """
    Belirtilen sayısal sütundaki aykırı (outlier) değerleri 
    IQR (Interquartile Range) yöntemiyle tespit eder ve özetler.
    """
    if not os.path.exists(file_path):
        return f"Hata: '{file_path}' yolunda bir dosya bulunamadı."
    
    try:
        df = pd.read_csv(file_path)
        
        if column_name not in df.columns:
            return f"Hata: Sütun '{column_name}' veri setinde bulunamadı. Mevcut sütunlar: {list(df.columns)}"
        
        # Sayısal sütun kontrolünü normal if yapısına çevirdik
        is_numeric = pd.api.types.is_numeric_dtype(df[column_name])
        if not is_numeric:
            return f"Hata: '{column_name}' sütunu sayısal bir veri tipine sahip değil. Aykırı değer analizi yapılamaz."
        
        # Pyright'ı ikna etmek için ham sütun verisini çekiyoruz
        raw_series = df[column_name]
        if not isinstance(raw_series, pd.Series):
            return f"Hata: Sütun verisi okunamadı."
            
        series = raw_series.dropna()
        if not isinstance(series, pd.Series) or series.empty:
            return f"Hata: '{column_name}' sütununda analiz edilecek geçerli (sayısal) veri bulunamadı."
        
        # IQR Hesaplama
        q1 = float(series.quantile(0.25))
        q3 = float(series.quantile(0.75))
        iqr = q3 - q1
        
        lower_bound = q1 - 1.5 * iqr
        upper_bound = q3 + 1.5 * iqr
        
        # Filtreleme yapıp dönen verinin kesinlikle Series olduğunu doğruluyoruz
        filtered_outliers = series[(series < lower_bound) | (series > upper_bound)]
        if not isinstance(filtered_outliers, pd.Series):
            return f"Hata: Aykırı değerler hesaplanırken veri yapısı uyuşmazlığı oluştu."
            
        outliers = filtered_outliers
        outlier_count = len(outliers)
        outlier_ratio = (outlier_count / len(series)) * 100
        
        report = (
            f"🚨 **Aykırı Değer (Outlier) Analiz Raporu** 🚨\n"
            f"---------------------------------\n"
            f"🔹 **Sütun:** {column_name}\n"
            f"🔹 **İstatistiksel Eşikler:**\n"
            f"  - Alt Sınır (Lower Bound): {lower_bound:.2f}\n"
            f"  - Üst Sınır (Upper Bound): {upper_bound:.2f}\n\n"
            f"🔹 **Tespit Edilen Sonuçlar:**\n"
            f"  - Toplam Aykırı Değer Sayısı: {outlier_count}\n"
            f"  - Aykırı Değerlerin Oranı: %{outlier_ratio:.2f}\n"
        )
        
        if outlier_count > 0:
            sample_list = outliers.head(5).tolist()
            report += f"  - Bazı Örnek Aykırı Değerler: {sample_list}\n"
            
        report += "---------------------------------"
        return report
        
    except Exception as e:
        return f"Aykırı değer analizi yapılırken hata oluştu: {str(e)}"

if __name__ == "__main__":
    mcp.run()