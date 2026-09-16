(function () {
  'use strict';

  angular.module('umbraco').controller('MegaForm.V13FormPickerController', function ($scope, $http, notificationsService) {
    var vm = this;
    vm.forms = [];
    vm.loading = true;
    vm.error = '';

    vm.clear = function () {
      $scope.model.value = '';
    };

    $http.get('/umbraco/MegaForm/MegaFormApi/Form/List').then(function (response) {
      vm.forms = angular.isArray(response.data) ? response.data : [];
    }).catch(function () {
      vm.error = 'Unable to load MegaForm forms.';
      notificationsService.error('MegaForm', vm.error);
    }).finally(function () {
      vm.loading = false;
    });
  });
})();
