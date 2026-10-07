from django.urls import path

from . import views

urlpatterns = [
    path('auth/register/', views.register, name='register'),
    path('auth/login/', views.login_view, name='login'),
    path('auth/logout/', views.logout_view, name='logout'),
    path('auth/me/', views.current_user, name='current-user'),
    path('tasks/', views.tasks, name='tasks'),
    path('tasks/<int:task_id>/', views.task_detail, name='task-detail'),
]
