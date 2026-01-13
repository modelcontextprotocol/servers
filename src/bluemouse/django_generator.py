import re
from typing import Dict, List, Any


def sanitize_class_name(name: str) -> str:
    """Sanitize name to valid Python class name (CamelCase)"""
    # Remove "系統", "模組" and non-alphanumeric chars
    clean_name = name.replace('系統', '').replace('模組', '')
    # Convert to Title Case and remove spaces/special chars
    clean_name = re.sub(r'[^a-zA-Z0-9]', ' ', clean_name).title().replace(' ', '')
    # Ensure it doesn't start with a number
    if clean_name and clean_name[0].isdigit():
        clean_name = 'Model' + clean_name
    return clean_name or 'Default'


def generate_django_code(
    module: Dict[str, Any],
    answers: List[int]
) -> Dict[str, Any]:
    """生成 Django 代碼"""
    try:
        # 解析用戶回答
        features = parse_user_answers(module, answers)
        
        # 生成安裝說明 (先生成，因為要放入README)
        setup_instructions = generate_django_setup_instructions()

        # 生成各個文件
        files = {
            "models.py": generate_django_models(module, features),
            "views.py": generate_django_views(module, features),
            "serializers.py": generate_django_serializers(module, features),
            "urls.py": generate_django_urls(module, features),
            "requirements.txt": generate_django_requirements(features),
            "admin.py": generate_django_admin(module, features),
            "tests.py": generate_django_tests(module, features),
            "README.md": setup_instructions  # Include README in files dict
        }
        
        return {
            "files": files,
            "setup_instructions": setup_instructions,
            "framework": "Django",
            "version": "4.2"
        }
    except Exception as e:
        print(f"Django generation failed: {e}, falling back to Demo Mode")
        # 直接返回Demo Mode的固定結果，避免循環引用
        return {
        "files": {
            "models.py": "from django.db import models\n\nclass Demo(models.Model):\n    name = models.CharField(max_length=100)\n",
            "views.py": "from django.http import HttpResponse\n\ndef index(request):\n    return HttpResponse('Hello Demo')\n",
            "urls.py": "from django.urls import path\nfrom . import views\n\nurlpatterns = [path('', views.index)]\n",
             "requirements.txt": "Django>=4.2\n"
        },
        "setup_instructions": "Demo Mode (Fallback)",
        "framework": "Django (Demo)"
    }



def generate_django_models(module: Dict[str, Any], features: Dict) -> str:
    """生成 Django Models"""
    
    model_name = sanitize_class_name(module['name'])
    
    code = f'''"""
{module['name']} - 數據模型
自動生成 by 藍圖小老鼠
"""

from django.db import models
from django.contrib.auth.models import User
from django.utils import timezone


class {model_name}(models.Model):
    """
    {module['description']}
    """
    # 基礎字段
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="創建時間")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="更新時間")
    is_active = models.BooleanField(default=True, verbose_name="是否啟用")
    
'''
    
    # 根據功能添加字段
    if features.get('需要用戶關聯'):
        code += '''    # 用戶關聯
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='%(class)s_set',
        verbose_name="用戶"
    )
    
'''
    
    if features.get('需要名稱'):
        code += '''    # 基本信息
    name = models.CharField(max_length=200, verbose_name="名稱")
    description = models.TextField(blank=True, verbose_name="描述")
'''
    
    # Financial Precision
    if features.get('use_decimal'):
        code += '    amount = models.DecimalField(max_digits=19, decimal_places=4, default=0, verbose_name="金額")\n'
    else:
        code += '    amount = models.FloatField(default=0.0, verbose_name="金額")\n'
    
    code += '\n'
    
    if features.get('需要狀態'):
        code += '''    # 狀態管理
    STATUS_CHOICES = [
        ('draft', '草稿'),
        ('active', '啟用'),
        ('archived', '歸檔'),
    ]
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='draft',
        verbose_name="狀態"
    )
    
'''
    
    code += '''    class Meta:
        verbose_name = "{}"
        verbose_name_plural = "{}列表"
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['-created_at']),
        ]
    
    def __str__(self):
        return f"{{self.name if hasattr(self, 'name') else self.id}}"
    
    def save(self, *args, **kwargs):
        """保存前的驗證"""
        # 添加自定義驗證邏輯
        super().save(*args, **kwargs)
'''.format(model_name, model_name)
    
    return code


def generate_django_views(module: Dict[str, Any], features: Dict) -> str:
    """生成 Django Views"""
    
    model_name = sanitize_class_name(module['name'])
    
    code = f'''"""
{module['name']} - API 視圖
自動生成 by 藍圖小老鼠
"""

from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.shortcuts import get_object_or_404

from .models import {model_name}
from .serializers import {model_name}Serializer


class {model_name}ViewSet(viewsets.ModelViewSet):
    """
    {module['description']}
    
    提供標準的 CRUD 操作:
    - list: 獲取列表
    - create: 創建
    - retrieve: 獲取詳情
    - update: 更新
    - partial_update: 部分更新
    - destroy: 刪除
    """
    queryset = {model_name}.objects.all()
    serializer_class = {model_name}Serializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        """
        過濾查詢集
        只返回當前用戶的數據
        """
        queryset = super().get_queryset()
        
        # 只返回啟用的數據
        queryset = queryset.filter(is_active=True)
        
'''
    
    if features.get('需要用戶關聯'):
        code += '''        # 只返回當前用戶的數據
        if not self.request.user.is_staff:
            queryset = queryset.filter(user=self.request.user)
        
'''
    
    code += '''        return queryset
    
    def perform_create(self, serializer):
        """創建時自動關聯用戶"""
'''
    
    if features.get('需要用戶關聯'):
        code += '''        serializer.save(user=self.request.user)
'''
    else:
        code += '''        serializer.save()
'''
    
    code += '''    
    @action(detail=True, methods=['post'])
    def activate(self, request, pk=None):
        """啟用"""
        obj = self.get_object()
        obj.is_active = True
        obj.save()
        return Response({'status': 'activated'})
    
    @action(detail=True, methods=['post'])
    def deactivate(self, request, pk=None):
        """停用"""
        obj = self.get_object()
        obj.is_active = False
        obj.save()
        return Response({'status': 'deactivated'})
'''
    
    return code


def generate_django_serializers(module: Dict[str, Any], features: Dict) -> str:
    """生成 Django Serializers"""
    
    model_name = sanitize_class_name(module['name'])
    
    code = f'''"""
{module['name']} - 序列化器
自動生成 by 藍圖小老鼠
"""

from rest_framework import serializers
from .models import {model_name}


class {model_name}Serializer(serializers.ModelSerializer):
    """
    {module['description']}序列化器
    """
    
    class Meta:
        model = {model_name}
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at']
    
    def validate(self, data):
        """
        自定義驗證
        """
        # 添加驗證邏輯
        return data
    
    def create(self, validated_data):
        """
        創建實例
        """
        return super().create(validated_data)
    
    def update(self, instance, validated_data):
        """
        更新實例
        """
        return super().update(instance, validated_data)
'''
    
    return code


def generate_django_urls(module: Dict[str, Any], features: Dict) -> str:
    """生成 Django URLs"""
    
    model_name = sanitize_class_name(module['name'])
    app_name = model_name.lower()
    
    code = f'''"""
{module['name']} - URL 配置
自動生成 by 藍圖小老鼠
"""

from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import {model_name}ViewSet

# 創建路由器
router = DefaultRouter()
router.register(r'{app_name}', {model_name}ViewSet, basename='{app_name}')

# URL 模式
urlpatterns = [
    path('', include(router.urls)),
]
'''
    
    return code


def generate_django_requirements(features: Dict) -> str:
    """生成 Django Requirements"""
    
    requirements = [
        "Django>=4.2.0",
        "djangorestframework>=3.14.0",
        "django-cors-headers>=4.0.0",
        "python-decouple>=3.8",
    ]
    
    if features.get('需要認證'):
        requirements.append("djangorestframework-simplejwt>=5.2.0")
    
    if features.get('需要資料庫'):
        requirements.append("psycopg2-binary>=2.9.0")
    
    if features.get('需要快取'):
        requirements.append("django-redis>=5.2.0")

    if features.get('use_decimal'):
        # For professional money handling
        requirements.append("django-money>=3.2.0")
    
    return '\n'.join(requirements)


def generate_django_admin(module: Dict[str, Any], features: Dict) -> str:
    """生成 Django Admin"""
    
    model_name = sanitize_class_name(module.get('name', '模組'))
    description = module.get('description', '管理')
    
    code = f'''"""
{module.get('name', '模組')} - Admin 配置
自動生成 by 藍圖小老鼠
"""

from django.contrib import admin
from .models import {model_name}


@admin.register({model_name})
class {model_name}Admin(admin.ModelAdmin):
    """
    {description} Admin
    """
    list_display = ['id', 'created_at', 'is_active']
    list_filter = ['is_active', 'created_at']
    search_fields = ['id']
    ordering = ['-created_at']
    
    fieldsets = (
        ('基本信息', {{
            'fields': ('is_active',)
        }}),
        ('時間信息', {{
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }}),
    )
    
    readonly_fields = ['created_at', 'updated_at']
'''
    
    return code


def generate_django_tests(module: Dict[str, Any], features: Dict) -> str:
    """生成 Django Tests"""
    
    model_name = sanitize_class_name(module['name'])
    
    code = f'''"""
{module['name']} - 測試
自動生成 by 藍圖小老鼠
"""

from django.test import TestCase
from django.contrib.auth.models import User
from rest_framework.test import APIClient
from rest_framework import status

from .models import {model_name}


class {model_name}TestCase(TestCase):
    """
    {module['description']}測試
    """
    
    def setUp(self):
        """測試前準備"""
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='testuser',
            password='testpass123'
        )
        self.client.force_authenticate(user=self.user)
    
    def test_create(self):
        """測試創建"""
        data = {{}}
        response = self.client.post('/api/{model_name.lower()}/', data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
    
    def test_list(self):
        """測試列表"""
        response = self.client.get('/api/{model_name.lower()}/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
    
    def test_retrieve(self):
        """測試詳情"""
        obj = {model_name}.objects.create()
        response = self.client.get(f'/api/{model_name.lower()}/{{obj.id}}/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
    
    def test_update(self):
        """測試更新"""
        obj = {model_name}.objects.create()
        data = {{}}
        response = self.client.put(f'/api/{model_name.lower()}/{{obj.id}}/', data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
    
    def test_delete(self):
        """測試刪除"""
        obj = {model_name}.objects.create()
        response = self.client.delete(f'/api/{model_name.lower()}/{{obj.id}}/')
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
'''
    
    return code


def generate_django_setup_instructions() -> str:
    """生成 Django 安裝說明"""
    
    return """
# Django 項目設置說明

## 1. 安裝依賴
```bash
pip install -r requirements.txt
```

## 2. 配置數據庫
在 settings.py 中配置:
```python
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': 'your_db_name',
        'USER': 'your_db_user',
        'PASSWORD': 'your_db_password',
        'HOST': 'localhost',
        'PORT': '5432',
    }
}
```

## 3. 運行遷移
```bash
python manage.py makemigrations
python manage.py migrate
```

## 4. 創建超級用戶
```bash
python manage.py createsuperuser
```

## 5. 運行服務器
```bash
python manage.py runserver
```

## 6. 訪問 API
- API 文檔: http://localhost:8000/api/
- Admin 後台: http://localhost:8000/admin/
"""


def parse_user_answers(module: Dict[str, Any], answers: List[int]) -> Dict[str, bool]:
    """
    解析用戶回答,提取功能需求
    
    Args:
        module: 模組資訊
        answers: 用戶回答列表
        
    Returns:
        功能需求字典
    """
    features = {
        '需要用戶關聯': True,  # 默認需要
        '需要名稱': True,
        '需要狀態': True,
        '需要認證': True,
        '需要資料庫': True,
        '需要快取': False,
    }
    
    # 根據回答調整功能
    # User answers are passed as a list of selected option values (e.g. ['redis_stock', 'pydantic'])
    # Note: The input 'answers' might be indices or values depending on how run_standalone.py passes it.
    # Looking at run_standalone.py: generate_code accepts `answers: Dict[str, str]` (question_id -> option_value)
    
    # But this function signature says `answers: List[int]`. This is legacy.
    # Let's assume run_standalone.py passes a list of VALUES (strings) or we need to update signature.
    # However, let's treat `answers` as a flexible list of values for now.
    
    # Flatten answers if it's a dict, otherwise assume list of values
    selected_values = []
    if isinstance(answers, dict):
        selected_values = list(answers.values())
    elif isinstance(answers, list):
         selected_values = [str(x) for x in answers]

    # Map values to features
    for val in selected_values:
        if val in ['redis', 'redis_stock', 'async_check', 'throttling', 'cache']:
            features['需要快取'] = True
        if val in ['sharding', 'read_write_split']:
            features['需要資料庫'] = True # Enhanced DB
        if val in ['pydantic', 'strict']:
            features['需要嚴格驗證'] = True
        if val in ['decimal']:
            features['use_decimal'] = True
            
    return features
