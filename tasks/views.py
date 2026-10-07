from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.models import User
from django.db.models import Q
from django.shortcuts import render
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from .models import Task
from .serializers import LoginSerializer, RegistrationSerializer, TaskSerializer


@ensure_csrf_cookie
def app(request):
    return render(request, 'app.html')


@api_view(['POST'])
@permission_classes([AllowAny])
def register(request):
    serializer = RegistrationSerializer(data=request.data)
    if not serializer.is_valid():
        return Response({'errors': serializer.errors}, status=status.HTTP_400_BAD_REQUEST)
    user = serializer.save()
    login(request, user)
    return Response({'user': {'username': user.username, 'email': user.email}}, status=status.HTTP_201_CREATED)


@api_view(['POST'])
@permission_classes([AllowAny])
def login_view(request):
    serializer = LoginSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    user = authenticate(
        request,
        username=serializer.validated_data['username'],
        password=serializer.validated_data['password'],
    )
    if user is None:
        return Response({'error': 'The username or password is incorrect.'}, status=status.HTTP_401_UNAUTHORIZED)
    login(request, user)
    return Response({'user': {'username': user.username, 'email': user.email}})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def logout_view(request):
    logout(request)
    return Response({'message': 'You have been signed out.'})


@api_view(['GET'])
@permission_classes([AllowAny])
def current_user(request):
    if not request.user.is_authenticated:
        return Response({'authenticated': False})
    return Response({
        'authenticated': True,
        'user': {'username': request.user.username, 'email': request.user.email},
    })


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def tasks(request):
    if request.method == 'POST':
        serializer = TaskSerializer(data=request.data)
        if serializer.is_valid():
            task = serializer.save(user=request.user)
            return Response(TaskSerializer(task).data, status=status.HTTP_201_CREATED)
        return Response({'errors': serializer.errors}, status=status.HTTP_400_BAD_REQUEST)

    queryset = Task.objects.filter(user=request.user)
    search = request.query_params.get('search', '').strip()
    status_filter = request.query_params.get('status', '').strip()
    priority_filter = request.query_params.get('priority', '').strip()
    if search:
        queryset = queryset.filter(Q(title__icontains=search) | Q(description__icontains=search))
    if status_filter in dict(Task.STATUS_CHOICES):
        queryset = queryset.filter(status=status_filter)
    if priority_filter in dict(Task.PRIORITY_CHOICES):
        queryset = queryset.filter(priority=priority_filter)
    return Response(TaskSerializer(queryset, many=True).data)


@api_view(['GET', 'PUT', 'DELETE'])
@permission_classes([IsAuthenticated])
def task_detail(request, task_id: int):
    try:
        task = Task.objects.get(id=task_id, user=request.user)
    except Task.DoesNotExist:
        return Response({'error': 'Task not found.'}, status=status.HTTP_404_NOT_FOUND)

    if request.method == 'DELETE':
        task.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
    if request.method == 'PUT':
        serializer = TaskSerializer(task, data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response({'errors': serializer.errors}, status=status.HTTP_400_BAD_REQUEST)
    return Response(TaskSerializer(task).data)
