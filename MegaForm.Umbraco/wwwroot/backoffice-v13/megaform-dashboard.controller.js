(function () {
  'use strict';

  angular.module('umbraco').controller('MegaForm.V13DashboardController', function ($scope, $window, $sce, $http) {
    var vm = this;
    vm.forms = [];
    vm.loading = true;
    vm.active = 'dashboard';

    function trust(url) {
      vm.frameUrl = $sce.trustAsResourceUrl(url);
    }

    vm.open = function (destination, formId) {
      vm.active = destination === 'builder' ? 'builder-' + Number(formId || 0) : destination;
      switch (destination) {
        case 'create':
          trust('/umbraco/MegaForm/Admin?host=umbraco-v13&n=' + Date.now() + '#mf-new-form');
          break;
        case 'builder':
          trust('/umbraco/MegaForm/Builder/' + Number(formId || 0) + '?host=umbraco-v13');
          break;
        case 'submissions':
          trust('/umbraco/MegaForm/Submissions' + (formId ? '?formId=' + Number(formId) : ''));
          break;
        case 'languages':
          trust('/umbraco/MegaForm/Languages');
          break;
        case 'settings':
          trust('/umbraco/MegaForm/Admin?host=umbraco-v13#settings');
          break;
        default:
          vm.active = 'dashboard';
          trust('/umbraco/MegaForm/Admin?host=umbraco-v13');
          break;
      }
    };

    function loadForms() {
      vm.loading = true;
      return $http.get('/umbraco/MegaForm/MegaFormApi/Form/List').then(function (response) {
        vm.forms = angular.isArray(response.data) ? response.data : [];
      }).catch(function () {
        vm.forms = [];
      }).finally(function () {
        vm.loading = false;
      });
    }

    function onMessage(event) {
      var data = event && event.data;
      var formId = Number(data && data.formId || 0);
      if (event.origin !== $window.location.origin || !data || data.type !== 'megaform:form-created' || formId <= 0) return;
      $scope.$evalAsync(function () {
        loadForms();
        vm.open('builder', formId);
      });
    }

    $window.addEventListener('message', onMessage, false);
    $scope.$on('$destroy', function () { $window.removeEventListener('message', onMessage, false); });

    vm.open('dashboard');
    loadForms();
  });
})();
